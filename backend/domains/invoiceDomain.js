import { escapeHtml as h } from '../utils/html.js';
import { toMoney } from '../utils/money.js';

/**
 * Invoice Domain (Pure Logic)
 * 
 * Rules:
 * - NO database queries
 * - Uses snapshot data from the Booking record
 * - Returns a fully formatted HTML string
 */
export const invoiceDomain = {

  /**
   * Generates the HTML for the invoice
   * 
   * @param {Object} input
   * @param {Object} input.booking - Snapshot data
   * @param {Object} input.hotel - Hotel data
   * @param {String} input.invoiceRef - The generated invoice number (e.g. ZIV/2026/0001)
   * @param {Date} input.issueDate - Issue Date
   * @returns {String} HTML string
   */
  generateHTML: (input) => {
    const { booking, hotel, invoiceRef, issueDate } = input;

    const timeZoneOptions = { timeZone: 'Asia/Kolkata' };

    const formattedDate = new Intl.DateTimeFormat('en-IN', {
      ...timeZoneOptions, year: 'numeric', month: 'long', day: 'numeric'
    }).format(issueDate);

    const checkInDate = new Intl.DateTimeFormat('en-IN', {
      ...timeZoneOptions, year: 'numeric', month: 'short', day: 'numeric'
    }).format(new Date(booking.checkIn));

    const checkOutDate = new Intl.DateTimeFormat('en-IN', {
      ...timeZoneOptions, year: 'numeric', month: 'short', day: 'numeric'
    }).format(new Date(booking.checkOut));

    const formatCurrency = (amount) => `₹${(toMoney(amount) || 0).toFixed(2)}`;

    // The hotel's own GSTIN (the old code read a non-existent field and printed a made-up one)
    const hotelGstIn = hotel.gstin ? h(hotel.gstin) : 'Not GST-registered';
    const hotelState = h(hotel.integrationSettings?.addressDetails?.state || hotel.state || hotel.city || '');
    const total = toMoney(booking.totalAmount) || 0;
    const paid = toMoney(booking.paidAmount) || 0;
    const status = paid >= total && total > 0
      ? { text: 'PAID', color: '#10b981' }
      : paid > 0 ? { text: 'PART-PAID', color: '#d97706' } : { text: 'PAYABLE AT HOTEL', color: '#d97706' };
    const discount = toMoney(booking.metadata?.discountAmount) || 0;
    const taxPct = booking.metadata?.taxPercentage;
    // Accommodation is supplied where the property is, so GST is intra-state: half CGST, half SGST
    const gstLabel = taxPct != null ? `GST @ ${taxPct}% (CGST ${taxPct / 2}% + SGST ${taxPct / 2}%)` : 'GST'; 
    const hsnCode = '996311'; // Standard HSN/SAC for Hotel accommodation

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoiceRef}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 40px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
        .header .invoice-details { text-align: right; }
        .invoice-details h2 { margin: 0; color: #555; }
        .billing-row { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .billing-col { width: 48%; }
        .billing-col h3 { margin-top: 0; color: #2563eb; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #f8fafc; color: #333; font-weight: bold; padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .text-right { text-align: right; }
        .summary-box { float: right; width: 300px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: #f8fafc; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .summary-row.total { font-size: 18px; font-weight: bold; color: #2563eb; border-top: 2px solid #e2e8f0; padding-top: 10px; margin-top: 10px; }
        .footer { clear: both; margin-top: 80px; text-align: center; color: #777; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
        .clear { clear: both; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div>
            <div class="logo">ZivoHotels</div>
            <p style="margin: 5px 0 0; color: #666;">Premium Stays, Delivered.</p>
          </div>
          <div class="invoice-details">
            <h2>INVOICE</h2>
            <p style="margin: 5px 0 0;"><strong>Ref:</strong> ${invoiceRef}<br>
            <strong>Date:</strong> ${formattedDate}<br>
            <strong>Status:</strong> <span style="color: ${status.color}; font-weight: bold;">${status.text}</span></p>
          </div>
        </div>

        <div class="billing-row">
          <div class="billing-col">
            ${booking.guestCompanyName ? `
            <h3>Billed To</h3>
            <strong>${h(booking.guestCompanyName)}</strong><br>
            ${booking.guestCompanyGstin ? `<strong>GSTIN:</strong> ${h(booking.guestCompanyGstin)}<br>` : ''}
            ${booking.guestCompanyAddress ? `${h(booking.guestCompanyAddress)}<br>` : ''}
            Guest: ${h(booking.guestName)}` : `
            <h3>Billed To (Guest)</h3>
            <strong>${h(booking.guestName)}</strong><br>
            Email: ${h(booking.guestEmail)}<br>
            Phone: ${h(booking.guestPhone)}`}
          </div>
          <div class="billing-col">
            <h3>Property Details</h3>
            <strong>${h(hotel.name)}</strong><br>
            ${h(hotel.location)}, ${h(hotel.city)}<br>
            <strong>GSTIN:</strong> ${hotelGstIn}<br>
            <strong>Place of Supply (State):</strong> ${hotelState}
          </div>
        </div>

        <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <strong>Stay Details:</strong><br>
          Check-in: ${checkInDate} | Check-out: ${checkOutDate}<br>
          Guests: ${booking.adults} Adults, ${booking.children} Children | Rooms: ${booking.rooms}${(booking.bookingRooms || []).length > 1 ? booking.bookingRooms.map((r) => `<br>Room ${r.roomNumber}: ${h(r.roomType?.name || 'Room')} (${h(r.ratePlan?.name || '')}), ${r.adults} adult${r.adults === 1 ? '' : 's'}${r.children ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}, lead guest ${h(r.guestName)}`).join('') : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>HSN/SAC</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Room Tariff (Snapshot Rate)</td>
              <td>${hsnCode}</td>
              <td class="text-right">${formatCurrency(booking.roomPrice || 0)}</td>
            </tr>
            ${(booking.extraGuestCharges > 0) ? `
            <tr>
              <td>Extra Guest Charges</td>
              <td>${hsnCode}</td>
              <td class="text-right">${formatCurrency(booking.extraGuestCharges)}</td>
            </tr>` : ''}
            ${(booking.extraBedCharges > 0) ? `
            <tr>
              <td>Extra Bed Charges</td>
              <td>${hsnCode}</td>
              <td class="text-right">${formatCurrency(booking.extraBedCharges)}</td>
            </tr>` : ''}
            ${(booking.mealCharges > 0) ? `
            <tr>
              <td>Meal Plan Charges</td>
              <td>${hsnCode}</td>
              <td class="text-right">${formatCurrency(booking.mealCharges)}</td>
            </tr>` : ''}
            ${discount > 0 ? `
            <tr>
              <td>Discount</td>
              <td></td>
              <td class="text-right">− ${formatCurrency(discount)}</td>
            </tr>` : ''}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <span>Subtotal</span>
            <span>${formatCurrency(booking.subtotal || booking.baseAmount || 0)}</span>
          </div>
          <div class="summary-row">
            <span>${gstLabel}</span>
            <span>${formatCurrency(booking.taxAmount || 0)}</span>
          </div>
          <div class="summary-row total">
            <span>Total Amount</span>
            <span>${formatCurrency(booking.totalAmount || 0)}</span>
          </div>
          ${paid < total ? `
          <div class="summary-row"><span>Paid online</span><span>${formatCurrency(paid)}</span></div>
          <div class="summary-row"><span>Payable at hotel</span><span>${formatCurrency(total - paid)}</span></div>` : ''}
        </div>
        <div class="clear"></div>

        <div class="footer">
          <p>Thank you for booking with ZivoHotels.<br>
          If you have any questions concerning this invoice, please contact support.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }
};

export default invoiceDomain;
