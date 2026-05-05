/**
 * Use with ion-popover: reference="event", side="left", alignment="center".
 * Anchors to the viewport right edge, vertically centered (not the click target).
 */
export function birthdayPopoverViewportEvent(source: Event): Event {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const edgePad = 16;
  const target = (source as MouseEvent).target;
  return {
    target,
    clientX: Math.max(edgePad, w - edgePad),
    clientY: h / 2,
  } as unknown as Event;
}
