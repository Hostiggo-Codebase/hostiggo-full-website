import { percentOf, roundPaise, rupeesToPaise } from "./money";
import type { BookingInvoice, BookingInvoiceInput, BookingInvoiceLineItem } from "./types";

// Hostiggo Service Fee: 8% of the base property price.
export const HOSTIGGO_SERVICE_FEE_RATE = 0.08;

export const GST_RATES = {
  propertyHigh: 0.18,
  propertyLow: 0.05,
  /** Property GST is 18% above this threshold (rupees), 5% at or below it. */
  propertyThresholdRupees: 7500,
  hostiggoServiceFee: 0.18,
  breakfast: 0.05,
  otherServices: 0.18,
} as const;

/**
 * Single source of truth for the guest-facing checkout invoice: every line
 * item (property, Hostiggo service fee, breakfast, other services) plus
 * the GST charged on each, and the grand total. Pure function -- no I/O --
 * so the same calculation drives both the checkout UI and the stored
 * invoice record.
 */
export function calculateBookingInvoice(input: BookingInvoiceInput): BookingInvoice {
  const propertyPricePaise = rupeesToPaise(input.basePropertyPrice);
  const breakfastPricePaise = rupeesToPaise(input.breakfastPrice ?? 0);
  const otherServicesPricePaise = rupeesToPaise(input.otherServicesPrice ?? 0);

  // GST slab is decided by a single night's declared tariff -- the
  // check-in night's rate -- never by the summed multi-night total.
  // Without this, a cheap multi-night stay (e.g. 7 nights x ₹5,000) whose
  // total happens to cross ₹7,500 would get bumped to the 18% slab even
  // though every individual night was priced under the threshold.
  const gstRateBasisPrice = input.gstRateBasisPrice ?? input.basePropertyPrice;
  const propertyGstRate =
    gstRateBasisPrice > GST_RATES.propertyThresholdRupees
      ? GST_RATES.propertyHigh
      : GST_RATES.propertyLow;
  const gstOnPropertyPaise = percentOf(propertyPricePaise, propertyGstRate);

  const hostiggoServiceFeePaise = percentOf(propertyPricePaise, HOSTIGGO_SERVICE_FEE_RATE);
  const gstOnHostiggoServiceFeePaise = percentOf(
    hostiggoServiceFeePaise,
    GST_RATES.hostiggoServiceFee,
  );

  const breakfastGstPaise = percentOf(breakfastPricePaise, GST_RATES.breakfast);
  const otherServicesGstPaise = percentOf(otherServicesPricePaise, GST_RATES.otherServices);

  const grandTotalPaise = roundPaise(
    propertyPricePaise +
      gstOnPropertyPaise +
      hostiggoServiceFeePaise +
      gstOnHostiggoServiceFeePaise +
      breakfastPricePaise +
      breakfastGstPaise +
      otherServicesPricePaise +
      otherServicesGstPaise,
  );

  const lineItems: BookingInvoiceLineItem[] = [
    { label: "Property Price", amountPaise: propertyPricePaise, gstRate: propertyGstRate, gstAmountPaise: gstOnPropertyPaise },
    { label: "Hostiggo Service Fee", amountPaise: hostiggoServiceFeePaise, gstRate: GST_RATES.hostiggoServiceFee, gstAmountPaise: gstOnHostiggoServiceFeePaise },
  ];
  if (breakfastPricePaise > 0) {
    lineItems.push({ label: "Breakfast", amountPaise: breakfastPricePaise, gstRate: GST_RATES.breakfast, gstAmountPaise: breakfastGstPaise });
  }
  if (otherServicesPricePaise > 0) {
    lineItems.push({ label: "Other Services", amountPaise: otherServicesPricePaise, gstRate: GST_RATES.otherServices, gstAmountPaise: otherServicesGstPaise });
  }

  return {
    propertyPricePaise,
    propertyGstRate,
    gstOnPropertyPaise,
    hostiggoServiceFeePaise,
    hostiggoServiceFeeRate: HOSTIGGO_SERVICE_FEE_RATE,
    gstOnHostiggoServiceFeePaise,
    breakfastPricePaise,
    breakfastGstRate: GST_RATES.breakfast,
    breakfastGstPaise,
    otherServicesPricePaise,
    otherServicesGstRate: GST_RATES.otherServices,
    otherServicesGstPaise,
    lineItems,
    grandTotalPaise,
    grandTotalRupees: grandTotalPaise / 100,
  };
}

/**
 * Guest-facing all-in price for ONE night at `nightlyRupees`: base rate +
 * GST on the property (slab chosen from that nightly rate) + Hostiggo
 * service fee + GST on the service fee -- the exact same math as the
 * checkout invoice above (calculateBookingInvoice), so the number on a
 * listing card matches what a one-night booking actually costs before
 * optional add-ons. Exact to the paisa (shown with two decimals).
 */
export function allInNightlyPrice(nightlyRupees: number): number {
  if (!Number.isFinite(nightlyRupees) || nightlyRupees <= 0) return 0;
  const invoice = calculateBookingInvoice({ basePropertyPrice: nightlyRupees });
  return invoice.grandTotalPaise / 100;
}
