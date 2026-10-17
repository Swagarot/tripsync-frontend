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

// How you get around (the day's travel mode).
export const WalkIcon = () => (
  <Icon>
    <circle cx="13" cy="4" r="1.6" />
    <path d="m7 21 3-6.5M10 14.5l1.5-6.5 3 3 3 1M11.5 8 8 9.5 7 13M15 21l-2.5-6.5" />
  </Icon>
);

export const BikeIcon = () => (
  <Icon>
    <circle cx="5.5" cy="16.5" r="3.5" />
    <circle cx="18.5" cy="16.5" r="3.5" />
    <path d="M5.5 16.5 9 9h6.5l3 7.5M9 9l3.5 7.5h-7M14 5h2.5l-1 4" />
  </Icon>
);

export const CarIcon = () => (
  <Icon>
    <path d="M5 16V11l2-5h10l2 5v5M3.5 11h17M5 16h14" />
    <path d="M6 16v3M18 16v3" />
    <circle cx="8" cy="13.5" r="0.6" />
    <circle cx="16" cy="13.5" r="0.6" />
  </Icon>
);

export const TransitIcon = () => (
  <Icon>
    <rect x="5.5" y="3" width="13" height="14" rx="3" />
    <path d="M5.5 10.5h13M9 17l-2 4M15 17l2 4" />
    <circle cx="9" cy="13.8" r="0.6" />
    <circle cx="15" cy="13.8" r="0.6" />
  </Icon>
);
