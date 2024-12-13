import compatModules from "@embroider/virtual/compat-modules";

const seenNames = new Set();

const modules = {
  ...compatModules,
  ...import.meta.glob(
    [
      "./**/*.{gjs,js}",
      "./**/*.{hbs,hbr}",
      "!./static/**/*",
      "../../discourse-common/addon/**/*.{gjs,js}",
      "../../discourse-common/addon/**/*.hbs",
      "../../float-kit/addon/**/*.{gjs,js}",
      "../../float-kit/addon/**/*.hbs",
      "../../select-kit/addon/**/*.{gjs,js}",
      "../../select-kit/addon/**/*.hbs",
      "../../dialog-holder/addon/**/*.{gjs,js}",
      "../../dialog-holder/addon/**/*.hbs",
    ],
    { eager: true }
  ),
};

for (const [path, module] of Object.entries(modules)) {
  let name = path
    .replace("../../", "")
    .replace("./", "discourse/")
    .replace("/addon/", "/")
    .replace(/\.\w+$/, "");
  if (!seenNames.has(name)) {
    seenNames.add(name);
    window.define(name, [], () => module);
  }
}
