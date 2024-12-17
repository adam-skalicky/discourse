import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import ConditionalLoadingSpinner from "discourse/components/conditional-loading-spinner";
import LoadMore from "discourse/components/load-more";
import PostListItem from "discourse/components/post-list/item";
import hideApplicationFooter from "discourse/helpers/hide-application-footer";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { i18n } from "discourse-i18n";

export default class PostList extends Component {
  @tracked loading = false;
  @tracked canLoadMore = true;
  @tracked emptyText = this.args.emptyText || i18n("post_list.empty");

  @action
  async loadMore() {
    if (
      !this.canLoadMore ||
      this.loading ||
      this.args.fetchMorePosts === undefined
    ) {
      return;
    }
    this.loading = true;

    const posts = this.args.posts;
    if (posts && posts.length) {
      try {
        const newPosts = await this.args.fetchMorePosts();
        this.args.posts.addObjects(newPosts);

        if (newPosts.length === 0) {
          this.canLoadMore = false;
        }
      } catch (error) {
        popupAjaxError(error);
      } finally {
        this.loading = false;
      }
    }
  }

  <template>
    {{#if this.canLoadMore}}
      {{hideApplicationFooter}}
    {{/if}}

    <LoadMore @selector=".post-list-item" @action={{this.loadMore}}>
      <div class="post-list">
        {{#each @posts as |post|}}
          <PostListItem
            @post={{post}}
            @additionalItemClasses={{@additionalItemClasses}}
            @titleAriaLabel={{@titleAriaLabel}}
          />
        {{else}}
          <div>{{this.emptyText}}</div>
        {{/each}}
      </div>
      <ConditionalLoadingSpinner @condition={{this.loading}} />
    </LoadMore>
  </template>
}
