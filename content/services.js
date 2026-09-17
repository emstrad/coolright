// The nine things the business does, as words rather than markup.
//
// Every panel is pre-rendered into the page by the build. Google renders
// JavaScript; most AI crawlers do not, and a services section built from an
// array at runtime is roughly 1,500 words that they never see. The tab strip
// shows one pre-rendered panel at a time rather than writing innerHTML.

export const services = [
  {
    key: 'split',
    name: 'Wall-Mounted Splits',
    body: [
      'The single most common domestic install: one indoor unit, one outdoor condenser, a small core drilled through the wall. Fitted well it is quiet, unobtrusive and cheap to run. Fitted badly it drips, rattles, and cools one corner of the room.',
      'We agree unit position with you before anything is cut, keep pipe runs as short and as hidden as the building allows, and box or trunk what cannot be concealed neatly rather than leaving it clipped to a wall.',
    ],
  },
  {
    key: 'multi',
    name: 'Multi-Split Systems',
    body: [
      'One outdoor unit serving two to five indoor units, which is usually the right answer for a whole house or a flat where roof and balcony space is limited and a condenser per room is out of the question.',
      'Sizing matters more here, because a multi-split shared across rooms that are never all in use at once behaves very differently from one that is. We calculate simultaneous load rather than adding room totals together.',
    ],
  },
  {
    key: 'ducted',
    name: 'Ducted and Cassettes',
    body: [
      'Where the equipment should be invisible: ceiling cassettes in offices and retail, or fully ducted systems with slim linear grilles in higher-end residential and new-build.',
      'These need to be designed alongside the ceiling and the building services rather than retrofitted around them. We will tell you early if the void you have will not take the unit, rather than after the plasterboard is up.',
    ],
  },
  {
    key: 'heating',
    name: 'Heating and Heat Pumps',
    body: [
      'Modern inverter air conditioning is an air-to-air heat pump, and in a well-insulated room it heats far more cheaply than an electric radiator and often more cheaply than gas. Many clients come for cooling and end up using it mostly in winter.',
      'We specify equipment rated for low ambient heating, size for the heating load as well as the cooling load, and set the controls up so the system is genuinely usable year round.',
    ],
  },
  {
    key: 'ventilation',
    name: 'Ventilation and MVHR',
    body: [
      'Cooling a sealed room does not make the air in it fresh. Extract ventilation, positive input ventilation and whole-house MVHR all address a different problem: stale air, condensation and humidity.',
      'We install and commission extract and heat recovery systems, and where a property has both a damp problem and a comfort problem we will say which one to solve first.',
    ],
  },
  {
    key: 'servicing',
    name: 'Servicing Plans',
    body: [
      'An air conditioning system that is never serviced loses efficiency quietly, then fails on the hottest day of the year. Filters block, coils foul, condensate trays grow biofilm, and refrigerant charge drifts.',
      'Annual or six-monthly visits, filter and coil cleaning, drain treatment, refrigerant and electrical checks, performance readings recorded so we can see decline before it becomes a breakdown. Plan clients get priority on the diary.',
    ],
  },
  {
    key: 'repairs',
    name: 'Repairs and Regas',
    body: [
      'Not cooling, leaking water, tripping out, a fault code on the display, or noisy in a way it never used to be. We diagnose before we quote, and we tell you honestly when a repair is not economic against a replacement.',
      'Leak detection, brazed repairs, component replacement and recharge to the correct weighed-in charge. A system that needs regassing has a leak, so we find it rather than topping it up and taking your money twice.',
    ],
  },
  {
    key: 'commercial',
    name: 'Commercial and Comms Rooms',
    body: [
      'Offices, retail, hospitality, salons, gyms, and the server and comms rooms that cannot be allowed to get warm at all. Different priorities: resilience, noise limits, planning and landlord consents, and working around trading hours.',
      'We handle the consents, work out of hours where needed, and set up F-Gas leak checking and record keeping for systems over the regulated thresholds so your compliance file is not a problem later.',
    ],
  },
  {
    key: 'bespoke',
    name: 'Bespoke Solutions',
    body: [
      'Listed buildings, glazed extensions, loft conversions, home cinemas, wine rooms, plant rooms with no obvious condenser position. The jobs other installers decline, usually for good reasons that can still be designed around.',
      'We visit, model the load, and propose something that works within the constraints of the building and the consents available, rather than telling you it cannot be done or fitting something that will not cope.',
    ],
  },
];
