# Priority #4: Fix Listing Page Filters

- [x] **Backend Fixes**
  - [x] Update `getAllHotels` to parse `priceMin` and `priceMax`.
  - [x] Point price filters to `where.roomTypes.some.ratePlans.some.basePrice` instead of legacy field.
  - [x] Include `ratePlans` in the returned hotel object.
- [x] **Frontend Fixes**
  - [x] Ensure `Listing.jsx` parses query params to send via `getHotels` using `priceMin`, `priceMax`, and `stars`.
  - [x] Update client-side sort logic to use `a.roomTypes?.[0]?.ratePlans?.[0]?.basePrice`.
  - [x] Update `HotelCard.jsx` to dynamically map and display the deeply nested Base Price cleanly.
- [x] **Verification**
  - [x] Run `npm run build` to verify syntax.
