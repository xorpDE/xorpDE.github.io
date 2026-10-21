/*
 * Site settings: the one file you normally edit.
 *
 * Loaded with a plain <script> tag before js/app.js, so keep it valid JavaScript: quotes around text and a
 * comma between entries.
 */
window.SITE_CONFIG = {
  // Site name: shown in the header, the footer, the browser tab and in every map title ("<name> - by <brand>").
  brand: "Xorpde Heatmap",

  // Optional links to an imprint and a privacy page, shown in the footer. Leave a value empty ("") to hide it.
  imprintUrl: "",
  privacyUrl: "",

  // Map region buttons ("Map region"), in this order. key: the map engine's name for the region (do not
  // change it); label: the button text. defaultRegion is selected when the page opens.
  defaultRegion: "europe",
  regions: [
    { key: "world", label: "World" },
    { key: "europe", label: "Europe" },
    { key: "balkans", label: "Balkans" },
    { key: "mediterranean", label: "Mediterranean" },
    { key: "eastern_mediterranean", label: "Eastern Mediterranean" },
    { key: "middle_east", label: "Middle East" },
    { key: "central_asia", label: "Caucasus & Central Asia" },
    { key: "south_asia", label: "South Asia" },
    { key: "east_asia", label: "East Asia" },
    { key: "southeast_asia", label: "Southeast Asia & Oceania" },
    { key: "africa", label: "Africa" },
    { key: "north_america", label: "North America" },
    { key: "south_america", label: "South America" }
  ],

  // Example buttons under the coordinates box: one click fills in the coordinates; the visitor then chooses
  // the settings and presses "Create map". Real scaled G25 population averages (Moriopoulos Collection).
  samples: [
    {
      label: "Czech",
      coords: "Czech,0.131638,0.132820,0.060992,0.046278,0.038108,0.017369,0.006987,0.008401,0.001689,-0.008304,-0.002787,-0.002394,0.004533,0.011083,-0.002548,0.000909,0.001220,0.000190,0.003336,0.001359,-0.001597,-0.001271,0.004459,0.001577,-0.000140"
    },
    {
      label: "Basque",
      coords: "Basque,0.125479,0.148958,0.054411,0.008540,0.054127,0.000591,-0.000630,0.000812,0.028977,0.041747,-0.005287,0.010383,-0.024963,-0.018640,0.015266,0.001946,-0.005846,0.002980,-0.002137,-0.003161,0.008365,0.001647,-0.007010,-0.008502,0.000857"
    },
    {
      label: "Sicilian",
      coords: "Sicilian,0.100876,0.146617,-0.004761,-0.043524,0.015002,-0.014084,-0.001909,-0.002221,0.005113,0.021641,0.002212,0.004552,-0.005147,-0.002666,-0.007821,-0.001641,0.004124,0.001140,0.002231,-0.004143,-0.002464,-0.001267,0.001125,0.001431,0.000120"
    }
  ],

  // Example maps in section 3 ("Figure 2a", "2b", ...). The files live in heatmap/examples/ (previews in
  // heatmap/examples/thumbs/).
  // Title format: "Country – Population (optional note)".
  examples: [
    { file: "czech.png", title: "Czech Republic – Czech" },
    { file: "sardinian.png", title: "Italy – Sardinian (scale up to 0.15)" },
    { file: "albanian.png", title: "Albania – Albanian" },
    { file: "basque.png", title: "Spain – Basque" },
    { file: "breton.png", title: "France – Breton" },
    { file: "catalan.png", title: "Spain – Catalan" },
    { file: "andalusian.png", title: "Spain – Andalusian" },
    { file: "trentino.png", title: "Italy – Trentino" },
    { file: "sicilian.png", title: "Italy – Sicilian" },
    { file: "world_czech.png", title: "World – Czech (scale up to 0.30)" },
    { file: "punjabi.png", title: "South Asia – Punjabi Arain (scale up to 0.15)" },
    { file: "japanese.png", title: "East Asia – Japanese (scale up to 0.15)" },
    { file: "yoruba.png", title: "Africa – Yoruba (scale up to 0.20)" }
  ]
};
