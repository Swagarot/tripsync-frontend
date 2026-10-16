import { createContext, useContext } from "react";

// Shared between the itinerary and the map on the trip page:
//   highlight / setHighlight  the stop under the mouse or last tapped, so its
//                             pin and its row light up together
//   preview / setPreview      a search result being looked at, shown as a
//                             temporary pin before it's added
//   focus(stopId)             scroll the itinerary to a stop (clicking a pin)
export const TripViewContext = createContext({
  highlight: null,
  setHighlight: () => {},
  preview: null,
  setPreview: () => {},
  focus: () => {},
});

export function useTripView() {
  return useContext(TripViewContext);
}
