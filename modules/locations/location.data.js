// Lightweight Philippine location data used as a cached fallback when an external provider is unavailable.
// The structure is Region -> Municipality/City -> Barangays with zip codes.
module.exports = {
  regions: [
    {
      code: 'NCR',
      name: 'National Capital Region',
      municipalities: [
        {
          code: 'MNL',
          name: 'Manila',
          zipCode: '1000',
          barangays: [
            { name: 'Barangay 1', zipCode: '1000' },
            { name: 'Barangay 2', zipCode: '1001' },
            { name: 'Barangay 3', zipCode: '1002' },
          ],
        },
        {
          code: 'QZN',
          name: 'Quezon City',
          zipCode: '1100',
          barangays: [
            { name: 'Bagong Pag-asa', zipCode: '1105' },
            { name: 'Pasong Tamo', zipCode: '1107' },
            { name: 'Commonwealth', zipCode: '1121' },
          ],
        },
      ],
    },
    {
      code: 'CAR',
      name: 'Cordillera Administrative Region',
      municipalities: [],
    },
    {
      code: 'REGION_I',
      name: 'Ilocos Region (Region I)',
      municipalities: [],
    },
    {
      code: 'REGION_II',
      name: 'Cagayan Valley (Region II)',
      municipalities: [],
    },
    {
      code: 'REGION_III',
      name: 'Central Luzon (Region III)',
      municipalities: [],
    },
    {
      code: 'REGION_IV_A',
      name: 'Calabarzon (Region IV-A)',
      municipalities: [
        {
          code: 'SNR',
          name: 'Santa Rosa',
          zipCode: '4026',
          barangays: [
            { name: 'Balibago', zipCode: '4026' },
            { name: 'Dila', zipCode: '4026' },
            { name: 'Labas', zipCode: '4026' },
          ],
        },
        {
          code: 'DAS',
          name: 'Dasmariñas',
          zipCode: '4114',
          barangays: [
            { name: 'Burol', zipCode: '4114' },
            { name: 'San Antonio', zipCode: '4114' },
            { name: 'Salitran', zipCode: '4114' },
          ],
        },
      ],
    },
    {
      code: 'REGION_IV_B',
      name: 'Mimaropa (Region IV-B)',
      municipalities: [],
    },
    {
      code: 'REGION_V',
      name: 'Bicol Region (Region V)',
      municipalities: [],
    },
    {
      code: 'REGION_VI',
      name: 'Western Visayas (Region VI)',
      municipalities: [],
    },
    {
      code: 'REGION_VII',
      name: 'Central Visayas (Region VII)',
      municipalities: [
        {
          code: 'CEB',
          name: 'Cebu City',
          zipCode: '6000',
          barangays: [
            { name: 'Lahug', zipCode: '6000' },
            { name: 'Mabolo', zipCode: '6000' },
            { name: 'Guadalupe', zipCode: '6000' },
          ],
        },
        {
          code: 'LAPU',
          name: 'Lapu-Lapu City',
          zipCode: '6015',
          barangays: [
            { name: 'Basak', zipCode: '6015' },
            { name: 'Gun-ob', zipCode: '6015' },
            { name: 'Pajo', zipCode: '6015' },
          ],
        },
      ],
    },
    {
      code: 'REGION_VIII',
      name: 'Eastern Visayas (Region VIII)',
      municipalities: [],
    },
    {
      code: 'REGION_IX',
      name: 'Zamboanga Peninsula (Region IX)',
      municipalities: [],
    },
    {
      code: 'REGION_X',
      name: 'Northern Mindanao (Region X)',
      municipalities: [],
    },
    {
      code: 'REGION_XI',
      name: 'Davao Region (Region XI)',
      municipalities: [],
    },
    {
      code: 'REGION_XII',
      name: 'Soccsksargen (Region XII)',
      municipalities: [],
    },
    {
      code: 'REGION_XIII',
      name: 'Caraga (Region XIII)',
      municipalities: [],
    },
    {
      code: 'BARMM',
      name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
      municipalities: [],
    },
  ],
};
