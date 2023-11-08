# frozen_string_literal: true

module Chat
  # Service responsible to add users to a channel.
  # The guardian passed in is the "acting user" when adding users.
  # The service is essentially creating memberships for the users.
  #
  # @example
  #  ::Chat::AddUsersToChannel.call(
  #    guardian: guardian,
  #    channel_id: 1,
  #    usernames: ["bob", "alice"]
  #  )
  #
  class AddUsersToChannel
    include Service::Base

    # @!method call(guardian:, **params_to_create)
    #   @param [Guardian] guardian
    #   @param [Integer] id of the channel
    #   @param [Hash] params_to_create
    #   @option params_to_create [Array<String>] usernames
    #   @return [Service::Base::Context]
    contract
    model :channel
    policy :can_add_users_to_channel
    model :users

    transaction do
      step :upsert_memberships
      step :recompute_users_count
      step :notice_channel
    end

    # @!visibility private
    class Contract
      attribute :usernames, :array
      validates :usernames, presence: true

      attribute :channel_id, :integer
      validates :channel_id, presence: true

      validate :usernames_length

      def usernames_length
        if usernames && usernames.length > SiteSetting.chat_max_direct_message_users + 1 # 1 for current user
          errors.add(
            :usernames,
            "should have less than #{SiteSetting.chat_max_direct_message_users} elements",
          )
        end
      end
    end

    private

    def can_add_users_to_channel(guardian:, channel:, **)
      (guardian.user.admin? || channel.joined_by?(guardian.user)) &&
        channel.direct_message_channel? && channel.chatable.group
    end

    def fetch_users(contract:, channel:, **)
      ::User.where(
        "username IN (?) AND id NOT IN (?)",
        [*contract.usernames],
        channel.allowed_user_ids,
      ).to_a
    end

    def fetch_channel(contract:, **)
      ::Chat::Channel.includes(:chatable).find_by(id: contract.channel_id)
    end

    def upsert_memberships(channel:, users:, **)
      always_level = ::Chat::UserChatChannelMembership::NOTIFICATION_LEVELS[:always]

      memberships =
        users.map do |user|
          {
            user_id: user.id,
            chat_channel_id: channel.id,
            muted: false,
            following: true,
            desktop_notification_level: always_level,
            mobile_notification_level: always_level,
            created_at: Time.zone.now,
            updated_at: Time.zone.now,
          }
        end

      context.added_user_ids =
        ::Chat::UserChatChannelMembership
          .upsert_all(
            memberships,
            unique_by: %i[user_id chat_channel_id],
            returning: Arel.sql("user_id, (xmax = '0') as inserted"),
          )
          .select { |row| row["inserted"] }
          .map { |row| row["user_id"] }

      ::Chat::DirectMessageUser.upsert_all(
        context.added_user_ids.map do |id|
          {
            user_id: id,
            direct_message_channel_id: channel.chatable.id,
            created_at: Time.zone.now,
            updated_at: Time.zone.now,
          }
        end,
        unique_by: %i[direct_message_channel_id user_id],
      )
    end

    def recompute_users_count(channel:, **)
      channel.update!(
        user_count: ::Chat::ChannelMembershipsQuery.count(channel),
        user_count_stale: false,
      )
    end

    def notice_channel(guardian:, channel:, users:, **)
      added_users = users.select { |u| context.added_user_ids.include?(u.id) }

      return if added_users.blank?

      ::Chat::CreateMessage.call(
        guardian: Discourse.system_user.guardian,
        chat_channel_id: channel.id,
        message:
          I18n.t(
            "chat.channel.users_invited_to_channel",
            invited_users: added_users.map { |u| "@#{u.username}" }.join(", "),
            inviting_user: "@#{guardian.user.username}",
            count: added_users.count,
          ),
      )
    end
  end
end