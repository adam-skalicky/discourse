import Controller from "@ember/controller";
import SettingsFilter from "admin/mixins/settings-filter";

export default class AdminPluginsShowSettingsController extends Controller.extend(
  SettingsFilter
) {}
