// The hub pages.
//
// A hub exists so the nav and the breadcrumbs point at a real page rather than
// at an anchor on the home page. An anchor tells a crawler the detail pages
// hang off nothing; a hub gives them a parent. Which means a hub has to be
// worth reading itself rather than being a list of links.

export const hubs = {
  services: {
    slug: 'services',
    h1: 'What we do, and how we approach each of it',
    title: 'Air Conditioning Services | Installation, Servicing, Repair | CoolRight',
    description: 'Installation, servicing, repairs, heating, ventilation and commercial air conditioning across London and the whole of the South East.',
    intro: [
      'Everything here is quoted after somebody has looked at it. That is not a way of avoiding the question: it is because the difference between a straightforward installation and an awkward one is a pipe route and a condenser position, and neither can be judged from a photograph of a room, let alone from a phone call.',
      'What we can tell you before any of that is how we approach each kind of work, what usually goes wrong with it, and what moves the price. Each page below does that for one thing we do. Where a job is really a different job wearing the same name, the pages say so: cooling will not fix condensation, a regas will not fix a leak, and a system sized from floor area will disappoint you in the second summer.',
    ],
  },

  guides: {
    slug: 'guides',
    h1: 'Cost guides, written to be useful before you commit to anyone',
    title: 'Air Conditioning Cost Guides | What It Really Costs | CoolRight',
    description: 'Honest cost ranges for air conditioning work in London and the South East, what moves the number, and when you do not need the work at all.',
    intro: [
      'Most air conditioning firms answer the cost question with "contact us for a quote". That is not an answer, and it leaves you comparing two prices with no idea which parts of them are real.',
      'These guides give the ranges a job in this region lands in, say plainly what moves the number, and say when you do not need the work at all. If you are holding two quotes and trying to work out why they differ by two thousand pounds, start here: the answer is usually access, pipe route, or what has been quietly left out of the cheaper one.',
    ],
  },
};
