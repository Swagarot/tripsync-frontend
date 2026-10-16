// Inline SVG icons. Unicode arrows/pencils render as coloured emoji on some
// systems (Windows), so draw them instead. currentColor = the button's text
// colour, so they follow the theme and the danger style.

function Icon({ children }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UpIcon = () => (
  <Icon>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const DownIcon = () => (
  <Icon>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Icon>
);

export const EditIcon = () => (
  <Icon>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);

export const DeleteIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

// Six dots: "you can drag this".
export const GripIcon = () => (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
    {[3, 9, 15].flatMap((y) => [<circle key={`a${y}`} cx="4" cy={y} r="1.6" />, <circle key={`b${y}`} cx="10" cy={y} r="1.6" />])}
  </svg>
);

// A house: back to the list of all trips.
export const HomeIcon = () => (
  <Icon>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
  </Icon>
);
