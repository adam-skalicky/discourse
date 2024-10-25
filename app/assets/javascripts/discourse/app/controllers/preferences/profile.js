import Controller from "@ember/controller";
import EmberObject, { action } from "@ember/object";
import { readOnly } from "@ember/object/computed";
import { service } from "@ember/service";
import { isEmpty } from "@ember/utils";
import FeatureTopicOnProfileModal from "discourse/components/modal/feature-topic-on-profile";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import discourseComputed from "discourse-common/utils/decorators";
import I18n from "discourse-i18n";

export default class ProfileController extends Controller {
  @service dialog;
  @service modal;

  subpageTitle = I18n.t("user.preferences_nav.profile");

  @readOnly("model.can_change_bio") canChangeBio;
  @readOnly("model.can_change_location") canChangeLocation;
  @readOnly("model.can_change_website") canChangeWebsite;
  @readOnly("model.can_upload_profile_header") canUploadProfileHeader;
  @readOnly("model.can_upload_user_card_background")
  canUploadUserCardBackground;

  saveAttrNames = [
    "bio_raw",
    "website",
    "location",
    "custom_fields",
    "user_fields",
    "profile_background_upload_url",
    "card_background_upload_url",
    "date_of_birth",
    "timezone",
    "default_calendar",
  ];

  calendarOptions = [
    { name: I18n.t("download_calendar.google"), value: "google" },
    { name: I18n.t("download_calendar.ics"), value: "ics" },
  ];

  @discourseComputed("model.user_fields.@each.value")
  userFields() {
    let siteUserFields = this.site.user_fields;
    if (isEmpty(siteUserFields)) {
      return;
    }

    if (this.showEnforcedRequiredFieldsNotice) {
      return this._missingRequiredFields(
        this.site.user_fields,
        this.model.user_fields
      );
    }

    // Staff can edit fields that are not `editable`
    if (!this.currentUser.staff) {
      siteUserFields = siteUserFields.filterBy("editable", true);
    }

    return siteUserFields.sortBy("position").map((field) => {
      const value = this.model.user_fields?.[field.id.toString()];
      return EmberObject.create({ field, value });
    });
  }

  @discourseComputed("currentUser.needs_required_fields_check")
  showEnforcedRequiredFieldsNotice(needsRequiredFieldsCheck) {
    return needsRequiredFieldsCheck;
  }

  @discourseComputed("model.user_option.default_calendar")
  canChangeDefaultCalendar(defaultCalendar) {
    return defaultCalendar !== "none_selected";
  }

  @action
  async showFeaturedTopicModal() {
    await this.modal.show(FeatureTopicOnProfileModal, {
      model: {
        user: this.model,
        setFeaturedTopic: (v) => this.set("model.featured_topic", v),
      },
    });
    document.querySelector(".feature-topic-on-profile-btn")?.focus();
  }

  _missingRequiredFields(siteFields, userFields) {
    return siteFields
      .filter(
        (siteField) =>
          this._requiredForAllUsers(siteField) &&
          isEmpty(userFields[siteField.id])
      )
      .map((field) => EmberObject.create({ field, value: "" }));
  }

  _requiredForAllUsers(field) {
    return ["for_all_users", "for_existing_users"].includes(field.requirement);
  }

  @action
  clearFeaturedTopicFromProfile() {
    this.dialog.yesNoConfirm({
      message: I18n.t("user.feature_topic_on_profile.clear.warning"),
      didConfirm: () => {
        return ajax(`/u/${this.model.username}/clear-featured-topic`, {
          type: "PUT",
        })
          .then(() => {
            this.model.set("featured_topic", null);
          })
          .catch(popupAjaxError);
      },
    });
  }

  @action
  useCurrentTimezone() {
    this.model.set("user_option.timezone", moment.tz.guess());
  }

  @action
  _updateUserFields() {
    const model = this.model,
      userFields = this.userFields;

    if (!isEmpty(userFields)) {
      const modelFields = model.get("user_fields");
      if (!isEmpty(modelFields)) {
        userFields.forEach(function (uf) {
          const value = uf.get("value");
          modelFields[uf.get("field.id").toString()] = isEmpty(value)
            ? null
            : value;
        });
      }
    }
  }

  @action
  save() {
    this.set("saved", false);

    // Update the user fields
    this.send("_updateUserFields");

    return this.model
      .save(this.saveAttrNames)
      .then(({ user }) => this.model.set("bio_cooked", user.bio_cooked))
      .catch(popupAjaxError)
      .finally(() => {
        this.currentUser.set("needs_required_fields_check", false);
        this.set("saved", true);
      });
  }
}
