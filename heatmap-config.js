window.SITE_CONFIG = {
  brand: "Xorpde Heatmap",

  mapBrand: "xorpde.github.io",
  imprintUrl: "",
  privacyUrl: "",

  defaultSamples: "moriopoulos",
  sampleSets: [
    { key: "moriopoulos", label: "Advanced Moriopoulos" },
    { key: "makedonas", label: "Makedonas G25" }
  ],

  defaultTheme: "standard",
  themes: [
    { key: "standard", label: "Standard", closest: "red", farthest: "dark blue" },
    { key: "bold", label: "Bold", closest: "dark red", farthest: "dark blue" },
    { key: "viridis", label: "Viridis", closest: "yellow", farthest: "dark purple" }
  ],

  defaultRegion: "europe",
  regions: [
    { key: "world", label: "World" },
    { key: "europe", label: "Europe" },
    { key: "mediterranean", label: "Mediterranean" },
    { key: "middle_east", label: "Middle East" },
    { key: "central_asia", label: "Caucasus & Central Asia" },
    { key: "south_asia", label: "South Asia" },
    { key: "east_asia", label: "East Asia" },
    { key: "southeast_asia", label: "Southeast Asia & Oceania" },
    { key: "africa", label: "Africa" },
    { key: "north_america", label: "North America" },
    { key: "south_america", label: "South America" }
  ],

  samples: [
    { label: "Albanian", coords: "Albanian,0.122682,0.145221,0.019741,-0.015869,0.026386,-0.004620,0.002391,0.001926,0.003539,0.017574,0.001624,0.002880,-0.007582,0.007820,-0.018440,-0.003159,0.010244,0.000176,0.008225,-0.006862,-0.010525,0.002495,0.003783,0.002567,-0.003348" },
    { label: "Sicilian", coords: "Sicilian,0.100876,0.146617,-0.004761,-0.043524,0.015003,-0.014084,-0.001909,-0.002221,0.005113,0.021641,0.002212,0.004552,-0.005147,-0.002666,-0.007821,-0.001641,0.004124,0.001140,0.002231,-0.004143,-0.002464,-0.001267,0.001125,0.001431,0.000120" },
    { label: "Greek", coords: "Greek (Central Macedonia),0.120802,0.142709,0.013636,-0.017374,0.020611,-0.004308,0.002313,0.001342,0.000872,0.013529,0.000880,0.001719,-0.002739,0.008109,-0.016790,-0.004177,0.005624,0.000700,0.005706,-0.004147,-0.007083,0.000576,0.002351,-0.001240,-0.000898" },
    { label: "Czech", coords: "Czech,0.131638,0.132820,0.060992,0.046278,0.038108,0.017369,0.006987,0.008401,0.001689,-0.008304,-0.002787,-0.002394,0.004533,0.011083,-0.002548,0.000909,0.001220,0.000190,0.003336,0.001359,-0.001597,-0.001271,0.004459,0.001577,-0.000140" }
  ],

  examples: [
    { file: "heatmap-example-albanian.png", title: "Albania: Albanian (Standard colours)" },
    { file: "heatmap-example-sicilian.png", title: "Italy: Sicilian (Bold colours)" },
    { file: "heatmap-example-greek.png", title: "Greece: Central Macedonia (Standard colours, Mediterranean map)" },
    { file: "heatmap-example-world_czech.png", title: "World: Czech (Viridis colours, scale up to 0.30)" }
  ]
};
