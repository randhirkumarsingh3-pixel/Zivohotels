-- Channel manager mappings: one row per room type and one per rate plan (each with the channel
-- manager's code), instead of a single row per room type.
DROP INDEX "ChannelMapping_hotelId_zivoRoomTypeId_externalProvider_key";

CREATE INDEX "ChannelMapping_hotelId_externalProvider_externalRoomCode_idx" ON "ChannelMapping"("hotelId", "externalProvider", "externalRoomCode");

CREATE UNIQUE INDEX "ChannelMapping_hotelId_externalProvider_zivoRoomTypeId_zivo_key" ON "ChannelMapping"("hotelId", "externalProvider", "zivoRoomTypeId", "zivoRatePlanId");
