/** Generic dialog layout fix: native cached heights must not crop larger ONLC fields. */
export const dialogLayout = `/* The native skin loads asynchronously. These selectors remain more specific
   than both its reset and the Onlc4 shared dialog styles. */
.tox.tox-silver-sink .tox-dialog {
  box-sizing: border-box;
  max-height: calc(100dvh - 32px);
  width: calc(100vw - 32px);
}
.tox.tox-silver-sink .tox-dialog:not(.tox-dialog--width-md):not(.tox-dialog--width-lg):not(.tox-dialog--fullscreen) {
  max-width: 760px;
}
/* The native tab panel caches a height before Onlc4 enlarges the fields.
   Let ordinary forms use their natural height; retain sizing of code/media
   dialogs which deliberately request medium, large or fullscreen layouts. */
.tox.tox-silver-sink .tox-dialog:not(.tox-dialog--width-md):not(.tox-dialog--width-lg):not(.tox-dialog--fullscreen) .tox-dialog__body-content {
  height: auto !important;
  flex-basis: auto !important;
}
.tox.tox-silver-sink .tox-dialog:not(.tox-dialog--width-md):not(.tox-dialog--width-lg):not(.tox-dialog--fullscreen) .tox-form {
  flex: 0 0 auto;
}
.tox.tox-silver-sink .tox-dialog__body,
.tox.tox-silver-sink .tox-dialog__content-js {
  min-height: 0;
  min-width: 0;
}
.tox.tox-silver-sink .tox-dialog__body-content {
  min-width: 0;
  overflow: auto;
}
.tox.tox-silver-sink .tox-dialog__header,
.tox.tox-silver-sink .tox-dialog__footer { flex-shrink: 0; }
.tox.tox-silver-sink .tox-dialog .tox-label {
  white-space: normal;
  overflow-wrap: anywhere;
}
.tox.tox-silver-sink .tox-dialog__body-nav-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 14px;
  margin: 0;
  color: #253041;
  background: transparent;
  border: 0;
  border-radius: 6px;
  font-size: 15px;
  line-height: 1.4;
  white-space: normal;
  text-align: left;
}
.tox.tox-silver-sink .tox-dialog__body-nav-item:hover { background: #eaf1fb; }
.tox.tox-silver-sink .tox-dialog__body-nav-item--active,
.tox.tox-silver-sink .tox-dialog__body-nav-item[aria-selected="true"],
.tox.tox-silver-sink .tox-dialog__body-nav-item--active:hover,
.tox.tox-silver-sink .tox-dialog__body-nav-item--active:focus {
  color: #fff;
  background: #334f70;
  font-weight: 700;
}
.tox.tox-silver-sink .tox-dialog__body-nav-item:focus-visible {
  outline: 3px solid #91b4d7;
  outline-offset: -3px;
}
@media (max-width: 767px) {
  .tox.tox-silver-sink .tox-dialog__body-nav-item {
    white-space: nowrap;
    flex-shrink: 0;
  }
}
@media (max-width: 600px) {
  .tox.tox-silver-sink .tox-dialog .tox-form__grid > .tox-form__group {
    width: 100%;
    min-width: 0;
  }
}

`;
