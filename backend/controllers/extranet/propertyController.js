import prisma from '../../config/db.js';
import { logActivity } from '../../services/activityService.js';
import { checkFeatureGate } from '../../services/featureGateService.js';

export const getProperty = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId; // Injected by hotelScopeGuard

    const property = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        media: true,
        cancellationPolicy: true,
      }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    // The owner's dashboard shows the agreed commission when asking them to sign
    const agreement = await prisma.agreement.findUnique({
      where: { hotelId },
      select: { status: true, commissionRate: true, signedAt: true }
    });

    // Payout account for the Finance page: bank name and the last 4 digits only
    const bank = await prisma.bankDetail.findUnique({ where: { hotelId: property.id }, select: { bankName: true, accountNumber: true } }).catch(() => null);
    const bankAccount = bank?.accountNumber ? { bankName: bank.bankName, last4: String(bank.accountNumber).slice(-4) } : null;
    res.json({ success: true, data: { ...property, agreement, bankAccount } });
  } catch (error) {
    console.error('Error fetching extranet property:', error);
    res.status(500).json({ success: false, message: 'Server error fetching property details' });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const updateData = req.body;
    
    // Feature Gate: Check if property is in SAFE_MODE (throttled/locked)
    const isSafeMode = await checkFeatureGate(hotelId, 'SAFE_MODE');
    if (isSafeMode) {
      return res.status(403).json({ success: false, message: 'Property is in Safe Mode. Updates are temporarily locked.' });
    }

    // Only the profile fields the Property Information page edits. (This was a block list: an
    // owner could change PAN/GSTIN/legal name, payout cycle, compliance score or approval fields
    // directly, and the page's own save failed because it sent back photos and related records.)
    // Legal, bank and commercial details change through support / the admin.
    const EDITABLE = ['name', 'description', 'checkInTime', 'checkOutTime', 'city', 'location', 'landmark'];
    const data = Object.fromEntries(
      EDITABLE.filter((k) => updateData[k] !== undefined).map((k) => [k, typeof updateData[k] === 'string' ? updateData[k].trim() : updateData[k]])
    );
    if (data.name === '') {
      return res.status(400).json({ success: false, message: 'Property name cannot be empty.' });
    }

    const before = await prisma.hotel.findUnique({ where: { id: hotelId } });

    const property = await prisma.hotel.update({
      where: { id: hotelId },
      data
    });

    await logActivity({
      hotelId,
      userId: req.user.id,
      action: 'PROPERTY_INFO_UPDATED',
      entityType: 'Hotel',
      entityId: hotelId,
      before,
      after: property
    });

    res.json({ success: true, data: property, message: 'Property details updated successfully.' });
  } catch (error) {
    console.error('Error updating extranet property:', error);
    res.status(500).json({ success: false, message: 'Server error updating property details' });
  }
};

/**
 * Extra addresses that get this property's booking emails (new booking, cancellations, guest
 * requests), on top of the reception email and the owner's login email. Up to 5.
 * PUT /extranet/property/booking-emails { emails: [] }
 */
export const updateBookingEmails = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = [...new Set(raw.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
    const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) return res.status(422).json({ success: false, message: `"${bad}" is not a valid email address.` });
    if (emails.length > 5) return res.status(422).json({ success: false, message: 'Add up to 5 booking emails.' });
    const hotel = await prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { integrationSettings: true } });
    const settings = hotel?.integrationSettings || {};
    const updated = await prisma.hotel.update({
      where: { id: req.scopedHotelId },
      data: { integrationSettings: { ...settings, contactInfo: { ...(settings.contactInfo || {}), bookingEmails: emails } } },
      select: { integrationSettings: true },
    });
    await logActivity({ hotelId: req.scopedHotelId, userId: req.user.id, action: 'BOOKING_EMAILS_UPDATED', entityType: 'HOTEL', entityId: req.scopedHotelId, details: { count: emails.length } }).catch(() => {});
    res.json({ success: true, message: 'Booking emails saved.', data: { bookingEmails: updated.integrationSettings.contactInfo.bookingEmails } });
  } catch (error) {
    console.error('updateBookingEmails:', error);
    res.status(500).json({ success: false, message: 'Could not save the booking emails.' });
  }
};
