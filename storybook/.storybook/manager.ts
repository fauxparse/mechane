/// <reference types="vite/client" />

import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

addons.setConfig({
  theme: create({
    base: prefersDark ? "dark" : "light",
    brandImage: prefersDark ? logoDark : logoLight,
  }),
});
