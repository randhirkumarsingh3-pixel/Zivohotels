import { Briefcase, Handshake, Building2 } from 'lucide-react';

/** The three ways to work with ZivoPlus (header "For business" menu and the home page band). */
export const FOR_BUSINESS = [
  {
    to: '/business', name: 'ZivoPlus for Business', Icon: Briefcase, short: 'Company travel',
    line: 'Company rates, GST invoices in your company\'s name, approvals and one account.',
    points: ['Company rates and GST invoices for input tax credit', 'Travel policy, approvers and monthly reports', 'Prepaid wallet or a credit line'],
    cta: 'Open a company account',
  },
  {
    to: '/partners', name: 'ZivoPlus Partner Hub', Icon: Handshake, short: 'For travel agents',
    line: 'Net rates with your markup or commission, branded vouchers, wallet and credit.',
    points: ['Net rates or commission on every stay', 'Vouchers with your agency\'s name and logo', 'Commission statements with TDS (194H)'],
    cta: 'Open an agency account',
  },
  {
    to: '/list-your-property', name: 'List your property', Icon: Building2, short: 'For hotels',
    line: 'Reach guests across India; manage rooms, rates, bookings and payouts in the Extranet.',
    points: ['Rooms, rates and inventory in one place', 'Bookings, guest requests and reviews', 'Payouts, GST invoices and reports'],
    cta: 'List your property',
  },
];
