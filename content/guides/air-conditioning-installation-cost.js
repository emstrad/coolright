export const page = {
  slug: 'air-conditioning-installation-cost',
  name: 'How much does air conditioning installation cost?',
  h1: 'How much does air conditioning cost to install?',
  title: 'Air Conditioning Installation Cost UK | Honest Ranges | CoolRight',
  description: 'What air conditioning installation actually costs in London and the South East, what moves the number, and when you do not need the work at all.',
  published: '2026-09-18',
  service: 'air-conditioning-installation',

  // NOT YET PUBLISHABLE. Every figure here has to come from the business, and
  // the build refuses this page until it does. Fill in from real quotes:
  //
  //   from and to, in whole pounds, for each of these, and only ranges the
  //   business will honour when the engineer has seen the room.
  //
  // ranges: [
  //   { what: 'One wall-mounted split, straightforward room', from: 0, to: 0 },
  //   { what: 'One split, awkward pipe route or difficult access', from: 0, to: 0 },
  //   { what: 'Two indoor units on a multi-split', from: 0, to: 0 },
  //   { what: 'Whole house, four to five indoor units', from: 0, to: 0 },
  // ],
  ranges: null,

  caveat: 'Stated once and plainly: these are the ranges a straightforward job in this region lands in once an engineer has seen the space. We do not price a job we have not seen, because a price given blind over the phone is a guess that gets corrected upwards later.',

  movers: [
    {
      h: 'Where the outdoor unit can go',
      p: 'The single largest variable. A condenser on a wall directly behind the indoor unit is the cheapest install there is. A condenser on a flat roof, in a light well, or anywhere that needs scaffold or a cherry picker adds access costs before anybody has fitted anything.',
    },
    {
      h: 'How far the pipe has to run, and whether it can be hidden',
      p: 'Refrigerant pipe, condensate and power all travel together. A three metre run through one external wall is quick. A fifteen metre run boxed through a stairwell, chased into plaster or lifted under a floor is a building job attached to an air conditioning job, and the making good is often the larger half.',
    },
    {
      h: 'The equipment, and what it is rated for',
      p: 'Capacity matters less to the price than quality does. Equipment selected for low sound power, or rated to hold its heating output in genuinely cold weather, costs more than the entry point, and for a bedroom or a room you intend to heat all winter it is the part worth paying for.',
    },
    {
      h: 'The electrical supply',
      p: 'A spare way in a modern consumer unit is straightforward. A board with no spare capacity, or a run across the house to reach it, adds an electrician and a day.',
    },
  ],

  notNeeded: [
    'If the room overheats only for a fortnight in July and holds temperature the rest of the year, external shading, a better blind or a decent fan may be all it needs, at a tenth of the cost.',
    'If the complaint is stuffiness, condensation or smell rather than heat, the problem is ventilation and cooling will not fix it. Extract or heat recovery is cheaper and is the right answer.',
    'If an existing system is under about eight years old and simply performing badly, a service and a proper clean often restore most of it. Ask for that before you price a replacement.',
  ],

  fairQuote: [
    'The equipment named by make and model, not just by capacity, so you can compare two quotes on the same basis.',
    'The pipe route described, and who makes good afterwards.',
    'The condenser position agreed and stated.',
    'Commissioning, pressure and vacuum testing, and warranty registration included rather than listed as extras.',
    'Whether scaffold or access equipment is included or excluded.',
    'What the price is fixed against, and what would change it.',
  ],

  neverAdded: 'Nothing is added afterwards unless you ask for something that was not in the quote, or the scope genuinely changes and you agree it in writing first. Commissioning, testing, waste removal and warranty registration are in the price.',
};
