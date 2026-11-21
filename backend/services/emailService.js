import prisma from '../config/db.js';
import { getSupportContacts, whatsappDigits } from '../config/supportContacts.js';
import { COVER_PHOTO_FIRST } from '../constants/coverPhoto.js';
import { BOOKING_ROOMS_INCLUDE, roomsSummary, guestsLabel } from './bookingRoomsView.js';
import { queueService } from './queueService.js';



/**
 * Generate premium HTML Booking Confirmation Email & Hotel Voucher
 * @param {object} booking - Booking data from database
 * @param {object} hotel - Hotel details
 * @param {object} roomType - Room type details
 * @param {object} ratePlan - Rate plan details
 * @returns {string} - HTML body
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const generateEmailHtml = (booking, hotel, roomType, ratePlan, support = {}) => {
  // Hourly stays show the slot's times (India time); nightly stays the dates
  const hourly = booking.stayType === 'HOURLY';
  const ist = { timeZone: 'Asia/Kolkata' };
  const at = (d) => new Date(d).toLocaleString('en-IN', { ...ist, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const checkInDate = hourly ? at(booking.slotStart || booking.checkIn) : new Date(booking.checkIn).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const checkOutDate = hourly ? at(booking.slotEnd || booking.checkOut) : new Date(booking.checkOut).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  
  const nights = Math.max(1, Math.round((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24)));
  const lengthText = hourly ? `${booking.hours} Hour${booking.hours === 1 ? '' : 's'} (hourly stay)` : `${nights} Night${nights > 1 ? 's' : ''}`;
  
  const formattedPaid = booking.paidAmount.toLocaleString('en-IN');
  const formattedTotal = booking.totalAmount.toLocaleString('en-IN');
  const formattedRemaining = booking.remainingAmount.toLocaleString('en-IN');
  
  // The booking's own amounts (these were estimates: 85% / 15% of the total and a made-up 20%
  // saving, with GST always shown as 12%)
  const inr = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');
  const taxes = Number(booking.taxAmount) || 0;
  const roomPrice = Number(booking.baseAmount) || Math.max(0, Number(booking.totalAmount) - taxes);
  const savings = Math.round(Number(booking.metadata?.discountAmount) || 0);
  const taxBreakdown = booking.metadata?.taxBreakdown;
  const gstLabel = taxBreakdown?.length > 1 ? taxBreakdown.map((t) => `${t.percentage}%`).join(' + ') : `${booking.metadata?.taxPercentage ?? 5}%`;
  
  // Dynamic QR Code url
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(booking.bookingRef)}`;
  
  // The hotel's cover photo (it looked for hotel.images, which doesn't exist, so every email showed
  // the same stock photo). Uploaded photos are site paths, so the site address goes in front.
  const site = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const coverUrl = hotel.media?.[0]?.url || '';
  const hotelImg = /^https?:\/\//.test(coverUrl) ? coverUrl : coverUrl && site ? `${site}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}` : '';
  // The hotel's front desk, then ZivoHotels support (was a placeholder +91 99999 99999)
  const contact = hotel.integrationSettings?.contactInfo || {};
  const hotelPhone = contact.receptionPhone || contact.guestLandline || '';
  // ZivoHotels support: Admin → Platform Settings → Support (or the server's ZIVO_SUPPORT_* settings)
  const supportPhone = support.phone || '';
  const supportEmail = support.email || '';
  const waDigits = whatsappDigits(hotelPhone || support.whatsapp || supportPhone);
  const mapsQuery = hotel.latitude && hotel.longitude ? `${hotel.latitude},${hotel.longitude}` : `${hotel.name}, ${hotel.city}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZivoHotels - Booking Confirmation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    .header {
      background-color: #0f172a;
      color: #ffffff;
      padding: 32px 24px;
      text-align: center;
      position: relative;
    }
    .brand-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.05em;
      color: #ffffff;
      margin: 0 0 16px 0;
      text-decoration: none;
      display: inline-block;
    }
    .status-badge {
      display: inline-block;
      background-color: #16a34a;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 6px 16px;
      border-radius: 9999px;
      margin-bottom: 12px;
    }
    .booking-ref-title {
      font-size: 14px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 4px 0;
    }
    .booking-ref-val {
      font-size: 28px;
      font-weight: 800;
      color: #38bdf8;
      margin: 0 0 8px 0;
      font-family: monospace;
    }
    .verified-banner {
      background-color: rgb(37 99 235 / 0.1);
      color: #38bdf8;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .hero-section {
      position: relative;
    }
    .hotel-image {
      width: 100%;
      height: 220px;
      object-cover: cover;
      display: block;
    }
    .hotel-details {
      padding: 24px;
      border-bottom: 1px solid #e2e8f0;
    }
    .hotel-name {
      font-size: 20px;
      font-weight: 800;
      margin: 0 0 8px 0;
      color: #0f172a;
    }
    .rating-stars {
      color: #f59e0b;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .hotel-address {
      font-size: 14px;
      color: #475569;
      margin: 0 0 16px 0;
      line-height: 1.5;
    }
    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .tag {
      font-size: 11px;
      font-weight: 600;
      background-color: #f1f5f9;
      color: #475569;
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .btn {
      display: inline-block;
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #ffffff !important;
    }
    .btn-secondary {
      background-color: #f1f5f9;
      color: #0f172a !important;
      border: 1px solid #cbd5e1;
    }
    .btn-danger {
      background-color: #fef2f2;
      color: #dc2626 !important;
    }
    .card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 24px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 800;
      margin: 0 0 16px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
    }
    .stay-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 12px;
    }
    .stay-col {
      flex: 1;
    }
    .stay-label {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .stay-value {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .divider {
      height: 1px;
      background-color: #e2e8f0;
      margin: 16px 0;
    }
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .pricing-row td {
      padding: 8px 0;
      font-size: 14px;
      color: #475569;
    }
    .pricing-row-total td {
      padding: 16px 0 8px 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      border-top: 1px dashed #cbd5e1;
    }
    .savings-banner {
      background-color: #dcfce7;
      border: 1px solid #bbf7d0;
      color: #15803d;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      margin-top: 16px;
      text-align: center;
    }
    .status-chip {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-chip-paid {
      background-color: #dcfce7;
      color: #15803d;
    }
    .status-chip-pending {
      background-color: #fef3c7;
      color: #d97706;
    }
    .ai-insights {
      background-color: #eff6ff;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      padding: 20px;
      margin: 24px;
    }
    .ai-insight-item {
      font-size: 13px;
      color: #1e40af;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.5;
    }
    .policy-item {
      font-size: 12px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 8px;
    }
    .badge-allowed {
      background-color: #dcfce7;
      color: #15803d;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .badge-restricted {
      background-color: #fee2e2;
      color: #b91c1c;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 24px;
    }
    .voucher-print {
      border: 2px dashed #94a3b8;
      border-radius: 16px;
      padding: 24px;
      margin: 24px;
      background-color: #ffffff;
    }
    .voucher-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    .voucher-title {
      font-size: 18px;
      font-weight: 800;
      margin: 0;
      color: #0f172a;
    }
    .voucher-qr {
      width: 90px;
      height: 90px;
    }
    .footer {
      background-color: #0f172a;
      color: #94a3b8;
      padding: 32px 24px;
      text-align: center;
      font-size: 12px;
      line-height: 1.6;
    }
    .footer-links a {
      color: #38bdf8;
      text-decoration: none;
      margin: 0 8px;
    }
    @media print {
      body {
        background-color: #ffffff;
      }
      .email-container {
        box-shadow: none;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
      .voucher-print {
        border: none;
        margin: 0;
        padding: 0;
        page-break-before: always;
      }
    }
    @media (max-width: 480px) {
      .stay-row {
        flex-direction: column;
        gap: 12px;
      }
      .actions-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    
    <!-- 1. HEADER -->
    <div class="header">
      <a href="https://zivohotels.com" class="brand-logo">ZivoHotels</a><br>
      <div class="status-badge">Confirmed</div>
      <div class="booking-ref-title">Booking Reference</div>
      <div class="booking-ref-val">${booking.bookingRef}</div>
      <div class="verified-banner">
        <span>🛡️</span> Secured & Verified Booking
      </div>
    </div>

    <!-- 2. HERO HOTEL SECTION -->
    <div class="hero-section">
      ${hotelImg ? `<img src="${esc(hotelImg)}" alt="${esc(hotel.name)}" class="hotel-image">` : ''}
    </div>
    
    <div class="hotel-details">
      <h2 class="hotel-name">${hotel.name}</h2>
      <div class="rating-stars">
        ${Array.from({ length: Math.round(hotel.rating || 5) }).map(() => '★').join('')}
        <span style="color: #475569; font-size: 13px; font-weight: bold; margin-left: 4px;">${hotel.rating} / 5</span>
      </div>
      <p class="hotel-address">${hotel.location}, ${hotel.city}</p>
      
      
      <div style="display: flex; gap: 8px;" class="no-print">
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}" class="btn btn-secondary" style="flex: 1; padding: 10px 12px; font-size: 13px;">Get Directions</a>
        ${waDigits ? `<a href="https://wa.me/${waDigits}?text=${encodeURIComponent(`Hi, I have a booking at ${hotel.name} with reference ${booking.bookingRef}`)}" class="btn btn-primary" style="flex: 1; padding: 10px 12px; font-size: 13px; background-color: #16a34a;">${hotelPhone ? 'WhatsApp the hotel' : 'WhatsApp ZivoHotels'}</a>` : ''}
      </div>
    </div>

    <!-- 3. STAY DETAILS CARD -->
    <div class="card">
      <h3 class="card-title">Stay Details</h3>
      
      <div class="stay-row">
        <div class="stay-col">
          <div class="stay-label">📅 Check-in</div>
          <div class="stay-value">${checkInDate}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">From 02:00 PM</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">📅 Check-out</div>
          <div class="stay-value">${checkOutDate}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Until 11:00 AM</div>
        </div>
      </div>
      
      <div class="stay-row">
        <div class="stay-col">
          <div class="stay-label">🏨 Room Type</div>
          <div class="stay-value">${esc(roomType.name)}</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">🍽️ Meal Plan</div>
          <div class="stay-value">${ratePlan.mealPlan === 'NONE' ? 'Room Only' : ratePlan.mealPlan === 'BREAKFAST' ? 'Breakfast Included' : 'Half Board'}</div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div class="stay-row" style="margin-bottom: 0;">
        <div class="stay-col">
          <div class="stay-label">👤 Guests</div>
          <div class="stay-value">${booking.adults} Adults ${booking.children > 0 ? `, ${booking.children} Children` : ''}</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">🔑 Booking Summary</div>
          <div class="stay-value">${booking.rooms} Room x ${lengthText}</div>
        </div>
      </div>
      ${(booking.bookingRooms || []).length > 1 ? `
      <div class="divider"></div>
      <div class="stay-label">🛏️ Rooms and lead guests</div>
      ${booking.bookingRooms.filter((r) => !r.cancelledAt).map((r) => `<div class="stay-value" style="margin-top:6px">Room ${r.roomNumber}: ${esc(r.roomType?.name || 'Room')} · ${esc(r.ratePlan?.name || '')} · ${esc(guestsLabel(r.adults, r.children))}<br><span style="font-weight:400">Lead guest: ${esc(r.guestName)}</span></div>`).join('')}` : ''}
    </div>

    <!-- 4. PRICE BREAKDOWN -->
    <div class="card" style="background-color: #ffffff; border-color: #e2e8f0;">
      <h3 class="card-title">Price Breakdown</h3>
      
      <table class="pricing-table">
        <tr class="pricing-row">
          <td>Room Charges (${booking.rooms} Room${booking.rooms > 1 ? 's' : ''} x ${lengthText}${savings > 0 ? ', after discounts' : ''})</td>
          <td style="text-align: right; font-weight: 700;">₹${inr(roomPrice)}</td>
        </tr>
        <tr class="pricing-row">
          <td>GST (${gstLabel})</td>
          <td style="text-align: right; font-weight: 700;">₹${inr(taxes)}</td>
        </tr>
        <tr class="pricing-row">
          <td>Service Fees</td>
          <td style="text-align: right; font-weight: 700; color: #16a34a;">FREE</td>
        </tr>
        <tr class="pricing-row-total">
          <td>Grand Total</td>
          <td style="text-align: right; font-weight: 800; color: #2563eb;">₹${formattedTotal}</td>
        </tr>
      </table>
      
      ${savings > 0 ? `<div class="savings-banner">
        🎉 You are saving ₹${inr(savings)} on this booking!
      </div>` : ''}
      
      <div class="divider"></div>
      
      <div class="stay-row" style="margin-bottom: 0;">
        <div class="stay-col">
          <div class="stay-label">Payment Status</div>
          <div style="margin-top: 4px;">
            <span class="status-chip ${booking.paymentStatus === 'PAID' ? 'status-chip-paid' : 'status-chip-pending'}">
              ${booking.paymentStatus === 'PAID' ? 'Fully Paid' : booking.paymentStatus === 'PARTIAL_PAID' ? 'Deposit Paid' : 'Pay At Hotel'}
            </span>
          </div>
        </div>
        <div class="stay-col">
          <div class="stay-label">Amount Paid</div>
          <div class="stay-value" style="color: #16a34a;">₹${formattedPaid}</div>
        </div>
        ${booking.remainingAmount > 0 ? `
        <div class="stay-col">
          <div class="stay-label">Balance Due</div>
          <div class="stay-value" style="color: #dc2626;">₹${formattedRemaining}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- 5. AI SMART INSIGHTS -->
    <div class="ai-insights">
      <h3 class="card-title" style="color: #1e3a8a; display: flex; align-items: center; gap: 6px; font-size: 14px;">
        ✨ Zivo AI Assistant
      </h3>
      <div class="ai-insight-item">
        <span>⚡</span> <span><strong>Fast Check-in:</strong> Property check-in usually takes less than 5 minutes. Early check-in option is subject to availability.</span>
      </div>
      <div class="ai-insight-item">
        <span>📶</span> <span><strong>Connectivity:</strong> Guests consistently rate this property's Wi-Fi as "Exceptional" (Avg 85 Mbps).</span>
      </div>
      <div class="ai-insight-item">
        <span>🚙</span> <span><strong>Transit Hint:</strong> Weekday traffic near the hotel location is typically low. Free parking is secured for you.</span>
      </div>
    </div>

    <!-- 6. POLICIES & INFORMATION -->
    <div class="card" style="background-color: #ffffff;">
      <h3 class="card-title">Policies & Important Info</h3>
      <div class="policy-item">
        <span class="badge-allowed">Allowed</span> <strong>ID Requirements:</strong> Government approved photo ID (Aadhaar, Passport, Driving License) is mandatory for check-in. Local IDs are accepted.
      </div>
      <div class="policy-item">
        <span class="badge-allowed">Allowed</span> <strong>Couple Policy:</strong> Couples are welcome. Safe and friendly environment for guests.
      </div>
      <div class="policy-item">
        <span class="badge-restricted">Restricted</span> <strong>Pet Policy:</strong> Pets are not allowed inside the property premises.
      </div>
      <div class="policy-item">
        <span class="badge-restricted">Restricted</span> <strong>Smoking Policy:</strong> All guest rooms are 100% non-smoking. Designated smoking zones are available.
      </div>
      <div class="policy-item" style="margin-top: 12px; font-size: 11px; color: #64748b;">
        <strong>Cancellation Rule:</strong> ${ratePlan.cancellationPolicy || 'Standard cancellation policies apply.'}
      </div>
    </div>

    <!-- 7. GUEST SUPPORT BLOCK -->
    <div style="padding: 0 24px; text-align: center;">
      <h4 style="margin: 0 0 4px 0; color: #475569; font-size: 14px;">Need help with check-in or changes?</h4>
      <p style="margin: 0 0 16px 0; color: #64748b; font-size: 12px;">${hotelPhone ? `The hotel: ${esc(hotelPhone)}. ` : ''}${site ? `Manage or cancel your booking in My Bookings: ${esc(site)}/my-bookings` : ''}</p>
      ${supportPhone || supportEmail ? `<div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 24px;">
        ZivoHotels support: ${[supportPhone && `📞 ${esc(supportPhone)}`, supportEmail && `✉️ ${esc(supportEmail)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}
      </div>` : ''}
    </div>

    <!-- 8. ACTIONS -->
    <div class="actions-grid no-print">
      <a href="https://zivohotels.com/my-bookings" class="btn btn-primary">Manage Booking</a>
      <button onclick="window.print()" class="btn btn-secondary">Print Voucher</button>
    </div>

    <!-- 9. HOTEL VOUCHER SECTION -->
    <div class="voucher-print">
      <div class="voucher-header">
        <div>
          <div class="voucher-title">ZivoHotels Voucher</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Booked via ZivoHotels</div>
          <div style="font-size: 14px; font-weight: 700; color: #2563eb; margin-top: 12px;">CONFIRMED RESERVATION</div>
        </div>
        <img src="${qrCodeUrl}" alt="QR Code" class="voucher-qr">
      </div>
      
      <div class="divider"></div>
      
      <div style="margin-bottom: 20px;">
        <div class="stay-label">Lead Guest</div>
        <div class="stay-value" style="font-size: 16px;">${booking.guestName}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Email: ${booking.guestEmail} &nbsp;·&nbsp; Phone: ${booking.guestPhone}</div>
      </div>
      
      <table style="width: 100%; font-size: 13px; line-height: 1.8; margin-bottom: 20px;">
        <tr>
          <td style="color: #64748b; font-weight: 700; width: 35%;">Hotel Name</td>
          <td style="font-weight: 700; color: #0f172a;">${hotel.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Address</td>
          <td style="color: #475569;">${hotel.location}, ${hotel.city}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Check-in Date</td>
          <td style="font-weight: 700; color: #0f172a;">${checkInDate}${hourly ? '' : ' (after 02:00 PM)'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Check-out Date</td>
          <td style="font-weight: 700; color: #0f172a;">${checkOutDate}${hourly ? '' : ' (before 11:00 AM)'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Room Type</td>
          <td style="font-weight: 700; color: #0f172a;">${esc(roomType.name)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Rooms & Guests</td>
          <td style="font-weight: 700; color: #0f172a;">${booking.rooms} Room x ${booking.adults} Adults ${booking.children > 0 ? `, ${booking.children} Children` : ''}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Total Paid Amount</td>
          <td style="font-weight: 800; color: #16a34a; font-size: 15px;">₹${formattedPaid}</td>
        </tr>
        ${booking.remainingAmount > 0 ? `
        <tr>
          <td style="color: #64748b; font-weight: 700;">Balance Due at Desk</td>
          <td style="font-weight: 800; color: #dc2626; font-size: 15px;">₹${formattedRemaining}</td>
        </tr>
        ` : ''}
      </table>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; font-size: 11px; text-align: center; color: #64748b;">
        📢 <strong>Notice to Guest:</strong> Please present this voucher and a government approved ID card at the front desk.
      </div>
    </div>

    <!-- 11. FOOTER -->
    <div class="footer">
      <div style="font-weight: 800; margin-bottom: 8px; color: #ffffff;">ZivoHotels Security</div>
      <p style="margin: 0 0 16px 0;">This is an automated, secure booking notification. Your data is protected by Zivo Security standards. A copy of this voucher and tax invoice has been stored in your profile.</p>
      
      <div class="footer-links" style="margin-bottom: 24px;">
        <a href="https://zivohotels.com/terms">Terms & Conditions</a> &nbsp;·&nbsp;
        <a href="https://zivohotels.com/privacy">Privacy Policy</a> &nbsp;·&nbsp;
        <a href="https://zivohotels.com/support">Help Desk</a>
      </div>
      
      <div>© 2026 ZivoHotels Private Limited. All Rights Reserved.</div>
    </div>

  </div>
</body>
</html>
  `;
};

/**
 * Send Booking Confirmation Email
 * @param {string} bookingId - Booking ID in DB
 * @returns {Promise<boolean>}
 */
export const sendBookingConfirmationEmail = async (bookingId) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hotel: { include: { media: { ...COVER_PHOTO_FIRST, select: { url: true } } } },
        roomType: true,
        ratePlan: true,
        ...BOOKING_ROOMS_INCLUDE
      }
    });

    if (!booking) {
      console.error(`[EmailService] Booking not found: ${bookingId}`);
      return false;
    }

    // Several rooms: "2 × Premium Suite, 1 × Standard Room"
    const roomLabel = { ...booking.roomType, name: roomsSummary(booking.bookingRooms, booking, booking.roomType?.name) };
    // Hourly stays have no rate plan: room only, with the hourly cancellation rule
    const hrs = Number(booking.metadata?.hourly?.freeCancelHours ?? 2);
    const plan = booking.ratePlan || { name: 'Hourly stay', mealPlan: 'NONE', cancellationPolicy: hrs > 0 ? `Free cancellation until ${hrs} hour${hrs === 1 ? '' : 's'} before check-in; no refund after that.` : 'Non-refundable once booked.' };
    const emailHtml = generateEmailHtml(booking, booking.hotel, roomLabel, plan, await getSupportContacts());

    console.log(`[EmailService] Enqueuing confirmation email job for booking ${booking.bookingRef} to ${booking.guestEmail}...`);
    
    await queueService.enqueue('email', 'SEND_BOOKING_CONFIRMATION', {
      to: booking.guestEmail,
      subject: booking.stayType === 'HOURLY'
        ? `Hourly stay confirmed at ${booking.hotel.name} - Ref: ${booking.bookingRef}`
        : `Booking Confirmed at ${booking.hotel.name} - Ref: ${booking.bookingRef}`,
      html: emailHtml
    }, { priority: 2 });
    
    console.log(`[EmailService] Booking Confirmation Email enqueued successfully!`);
    // Bell / SMS for the guest and the "New booking" alert + email for the hotel (once per booking)
    import('./bookingNotices.js').then((m) => m.onBookingConfirmed(bookingId)).catch((e) => console.error('[Notify] booking confirmed:', e.message));
    return true;
  } catch (error) {
    console.error('[EmailService] Error enqueuing booking confirmation email:', error);
    return false;
  }
};

/**
 * Emails a one-time code. `purpose` picks the wording (sign-up, sign-in, hotel email check).
 */
export const sendOTPEmail = async (to, otp, expiryMinutes = 10, { purpose = 'VERIFY', name } = {}) => {
  const { emailLayout } = await import('./emailLayout.js');
  const what = {
    SIGNUP: { subject: `${otp} is your ZivoHotels sign-up code`, title: 'Confirm your email', line: 'Enter this code to finish creating your ZivoHotels account:' },
    LOGIN: { subject: `${otp} is your ZivoHotels sign-in code`, title: 'Your sign-in code', line: 'Enter this code to sign in to ZivoHotels:' },
    PHONE: { subject: `${otp} is your ZivoHotels code`, title: 'Your ZivoHotels code', line: 'Enter this code to continue:' },
    VERIFY: { subject: `${otp} is your ZivoHotels verification code`, title: 'Verify your email', line: 'Your ZivoHotels verification code is:' },
  }[purpose] || { subject: `${otp} is your ZivoHotels code`, title: 'Your ZivoHotels code', line: 'Your code is:' };
  const html = await emailLayout({
    title: what.title,
    body: `${name ? `<p>Hi ${esc(name)},</p>` : ''}<p>${what.line}</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:14px;text-align:center;margin:16px 0;font-size:32px;font-weight:bold;letter-spacing:6px">${esc(otp)}</div>
      <p>It is valid for ${expiryMinutes} minutes and works once. Never share it: ZivoHotels will never ask you for it.</p>`,
    note: "If you didn't ask for this code, you can ignore this email.",
  });
  await queueService.enqueue('email', 'SEND_OTP', { to, subject: what.subject, html }, { priority: 1 });
  return { success: true };
};
