/* Where a floating layer is allowed to render.
 *
 * A modal `<dialog>` opened with `showModal()` is promoted to the browser's TOP
 * LAYER. That layer is outside the document's normal stacking context, so it
 * paints over everything below it no matter what those elements' z-index says,
 * and everything outside the dialog is also made inert. A popover portalled to
 * `document.body` — which is what Radix and `createPortal` do by default —
 * therefore lands UNDER the open dialog and under its ::backdrop, unclickable
 * and invisible, with no error anywhere to say so.
 *
 * That is the whole of the lab overlay's dead visualization switcher: the menu
 * opened, focus moved into it, Escape closed it again, and the learner saw a
 * chevron that did nothing. The tooltip had already been bitten once ("it
 * rendered as unstyled text under the lab overlay" — components/tooltip.tsx),
 * and a z-index was chosen to answer it, which cannot work for the same reason.
 *
 * So the container is a fact of the tree rather than a guess: an overlay
 * publishes its own dialog element here, and every floating layer inside it
 * portals THERE. Outside an overlay the value is null and `document.body` is
 * correct, which is why the default is null rather than a body reference —
 * `document` does not exist when this module is first evaluated under SSR or
 * in a test renderer.
 */

import { createContext, useContext } from "react";

const LayerContainer = createContext<HTMLElement | null>(null);

export const LayerContainerProvider = LayerContainer.Provider;

/**
 * The element floating layers should portal into: the nearest open overlay, or
 * `document.body` when there is none. Never call this during module
 * evaluation — it reads `document`.
 */
export function useLayerContainer(): HTMLElement {
  return useContext(LayerContainer) ?? document.body;
}
