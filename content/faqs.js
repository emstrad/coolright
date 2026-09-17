// The questions people actually ask before spending money on cooling.
//
// Written into the markup as <details> elements and into FAQPage structured
// data by the build, from this one source, so the schema can never claim an
// answer the page does not show.
//
// The cost question is answered as honestly as a quoted trade can answer it,
// and no range is published that the business would not honour. The full cost
// guides come with the guides section.

export const faqs = [
  {
    q: 'How much does air conditioning cost to install?',
    a: 'A single wall-mounted split in a straightforward room is the entry point, with multi-split and ducted systems rising from there depending on the number of rooms, the equipment chosen and how much making good is involved. We do not price a job we have not seen, because a price given blind over the phone is a guess that gets corrected upwards later. The visit is free and the written quote is fixed.',
  },
  {
    q: 'Do I need planning permission?',
    a: 'For most domestic installs, no. Outdoor units on houses usually fall under permitted development provided siting, size and noise conditions are met, but flats, listed buildings, conservation areas and front elevations are different. We check this when we visit and tell you before you commit.',
  },
  {
    q: 'How much does it cost to run?',
    a: 'Far less than most people expect. A modern inverter split serving a bedroom typically runs at a few hundred watts once it has reached temperature, rather than the full rated input. We give you indicative running costs for the equipment we propose, based on your usage rather than a best case.',
  },
  {
    q: 'Is it noisy?',
    a: 'The indoor unit at low fan speed is quieter than a fridge. The outdoor unit is the one that matters, for you and for your neighbours, so we select on sound power as well as capacity and site it thoughtfully. We will tell you if the only available position is a problem.',
  },
  {
    q: 'Can air conditioning heat my home too?',
    a: 'Yes. Any inverter system we install is a reversible air-to-air heat pump, and in an insulated room it is one of the cheapest ways to heat a space. We size for both loads so it performs properly in January as well as in July.',
  },
  {
    q: 'How often does it need servicing?',
    a: 'Annually for domestic, six-monthly for heavily used commercial systems. It protects the manufacturer warranty, keeps efficiency up, and prevents the two most common failures we attend: blocked condensate drains and fouled coils.',
  },
  {
    q: 'What is F-Gas and why does it matter?',
    a: 'Refrigerant handling is legally restricted to certified engineers and certified companies. An installer without F-Gas certification cannot lawfully work on the refrigerant circuit, and a system installed outside that framework can invalidate both the warranty and your insurance. We are registered, and we will show you the certificate.',
  },
  {
    q: 'How long does an install take?',
    a: 'Most single-room domestic installs are one day. Multi-splits are one to three days, and ducted and commercial work runs longer and is quoted by programme. You will have the dates in writing before we start.',
  },
  {
    q: 'Do you work on systems you did not install?',
    a: 'Yes, for servicing and repair, with the caveat that we will tell you plainly if we find something in the original installation that we cannot warrant. If it needs putting right, we will price that separately and openly.',
  },
];
