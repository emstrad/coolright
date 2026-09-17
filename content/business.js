// The single source of truth for the business's own facts.
//
// Every page, every schema block and every email relay reads from here, so a
// number that changes changes in one place. Nothing in this file is invented:
// anything not yet confirmed is null and the build refuses to write a page that
// needs it, which is why there is no placeholder phone number sitting in the
// markup waiting to be forgotten.

export const business = {
  name: 'CoolRight',
  slogan: 'Climate control. Done right.',
  domain: 'https://coolright.co.uk',

  // Confirmed.
  email: 'team@coolright.co.uk',

  // To be confirmed. Until it is, no tel: link is written anywhere, because a
  // number that rings the wrong person is worse than no number at all.
  phone: null,
  phoneDisplay: null,

  // To be confirmed. This is the sameAs target that ties the website to the map
  // listing, and for a local trade the map pack is what wins "near me". Until
  // the profile exists the business schema ships without it rather than with a
  // guess.
  googleBusinessProfile: null,

  // Schema.org type for an air conditioning installer.
  schemaType: 'HVACBusiness',

  region: 'London and the South East',
  regionLong: 'London and the whole of the South East',

  // Accreditation actually held, taken from the approved design. Nothing is
  // added to this list that the business cannot produce a certificate for.
  accreditations: ['F-Gas registered'],

  // Areas covered. The trade is the same in Croydon as in Bromley, so these are
  // a coverage statement and not a reason to build an area page per town.
  counties: [
    'Greater London',
    'Kent',
    'Surrey',
    'Essex',
    'Hertfordshire',
    'Sussex',
    'Berkshire',
    'Buckinghamshire',
    'Oxfordshire',
    'Hampshire',
    'Isle of Wight',
  ],
};

// True when a fact has been confirmed, so a template can ask rather than guess.
export const has = (key) => Boolean(business[key]);
