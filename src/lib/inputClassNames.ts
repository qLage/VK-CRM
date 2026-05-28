/**
 * Use on `<Input>` or `<SelectTrigger>` with a leading, absolutely positioned icon.
 * Base components use `px-4 lg:px-6`; at `lg`, that wins over unprefixed `pl-*`
 * unless padding is forced, so typed text overlaps the icon.
 */
export const INPUT_WITH_LEADING_ICON =
  "relative z-[1] !pl-8 lg:!pl-9 pr-4 lg:pr-6";
