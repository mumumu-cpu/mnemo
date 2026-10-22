import type { SVGProps } from "react";

const base = (d: React.ReactNode) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d}
  </svg>
);

export const IconUp = base(<path d="M12 19V5M5 12l7-7 7 7" />);
export const IconImage = base(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>);
export const IconX = base(<path d="M18 6 6 18M6 6l12 12" />);
export const IconPlay = base(<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />);
export const IconCheck = base(<path d="M20 6 9 17l-5-5" />);
export const IconRotate = base(<><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>);
export const IconArrowR = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowL = base(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconSpark = base(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />);
export const IconList = base(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />);
export const IconTrash = base(<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>);
export const IconExpand = base(<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />);
export const IconShrink = base(<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />);
export const IconLogout = base(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>);
export const IconCloudOff = base(<><path d="M22.6 17.4A5 5 0 0 0 18 10h-1.3A8 8 0 0 0 7 5.3" /><path d="M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3M2 2l20 20" /></>);
export const IconUser = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconHand = base(<path d="M9 11V5a1.5 1.5 0 0 1 3 0v5m0-1V4a1.5 1.5 0 0 1 3 0v6m0-1a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.3 15a1.5 1.5 0 0 1 2.4-1.8L9 16" />);
export const IconPen = base(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
export const IconFolder = base(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconPlus = base(<path d="M12 5v14M5 12h14" />);
export const IconSelect = base(<><rect x="3" y="3" width="18" height="18" rx="6" /><path d="m8 12 3 3 5-6" /></>);
export const IconMore = base(<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>);
export const IconShuffle = base(<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>);
