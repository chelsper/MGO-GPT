# Top Prospect Ranking

Select **Reorder prospects** beside the filters/export control in Top Prospects.
The compact dialog loads all active prospects for the selected MGO, not only the
filtered cards. Drag a handle, select a position, or choose **To top**. Keyboard
users can pick up a handle with Space, move with arrow keys, and drop with Space
or cancel the move with Escape. Touch users can hold a handle to drag while the
rest of each row remains available for normal scrolling.

Moves affect a local draft only. **Save order** commits the entire ranking once;
**Cancel** leaves the saved order unchanged and confirms discarding a dirty draft.
The list body scrolls independently of its heading and Save/Cancel controls.

## Safety

- MGOs edit their own workspace; Admins retain delegated MGO editing. Other
  delegated viewers remain read-only. Both API methods validate the session,
  editing permission, and exact selected workspace.
- The dialog reads local app data only. It neither calls NXT nor changes
  constituents, opportunities, ownership, or inactive prospect ranks.
- The save requires unique IDs covering the complete active set. A version
  derived from the saved order is compared in the same serializable database
  transaction as the update. Changed membership/order and concurrent conflicts
  require reloading rather than silently overwriting newer work.
- Failed or unconfirmed responses retain the draft but disable resending until
  the user reloads the current saved ranking. No automatic write retry is used.
- Successful saves update cached card ranks without triggering an NXT refresh.
  Filtered cards retain their actual saved rank rather than renumbering the subset.
- The older adjacent-swap POST endpoint remains for clients on older releases;
  the new editor uses a single versioned PUT. No database migration is required.

Automated tests cover draft moves, discard, save, malformed responses, workspace
permissions and conflicts. Local browser testing uses fictional prospects, never
live fundraising records.
