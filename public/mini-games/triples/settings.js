// See README.md for editing the rules, copy, families, and SVG art.
const TRIPLES_SETTINGS = {
  "rules": {
    "size": 6,
    "moveLimit": 100,
    "minimumEmptyTiles": 1,
    "countDistance": true,
    "blackClearsGray": true,
    "shuffleSamples": 32,
    "similarColorDistance": 0.24,
    "diagonalColorWeight": 0.35,
    "dragThreshold": 6,
    "clearAnimationTimeoutMs": 300
  },
  "copy": {
    "title": "Slide & Match: Triples",
    "instructions": "Drag a tile along a clear row or column, or click a tile and then an empty space. Select a tile to highlight its two matches. Connect an organ, its related condition or symptom, and its care option along their edges to merge them into one fixed gray tile.",
    "blackRule": "The black tile destroys gray tiles it touches along an edge.",
    "goal": "Match all {groups} groups in {limit} moves or fewer to win.",
    "moveLabel": "Moves",
    "newBoard": "New board",
    "reference": "Organ, condition, and care reference",
    "source": "Source",
    "score": "{merged} / {groups} triples matched",
    "board": "{size} by {size} game board",
    "roles": [
      "Organ",
      "Condition",
      "Care option"
    ],
    "ready": "Choose a tile and an empty square along a clear path.",
    "fixed": "Gray tiles are fixed in place.",
    "deselected": "Tile deselected.",
    "chooseEmpty": "Choose an empty space.",
    "blocked": "That tile has no clear path to an empty square.",
    "overBudget": "That slide exceeds your remaining moves. Choose a closer space.",
    "win": "You matched all {groups} triples!",
    "merged": "Triple merged.",
    "moved": "Tile moved.",
    "grayOne": "Black tile destroyed {count} gray tile.",
    "grayMany": "Black tile destroyed {count} gray tiles.",
    "loss": "You reached {limit} moves. You lost! Choose New board to try again.",
    "stuck": "No moves left. Choose New board to try again.",
    "invalid": "Choose an empty square along a clear row or column.",
    "fixedTile": "Fixed gray tile",
    "blackTile": "Black tile",
    "emptyTile": "Empty",
    "tile": "Tile {number}",
    "position": "row {row}, column {column}",
    "destination": "available destination",
    "matching": "matching tile"
  },
  "art": {
    "black": {
      "color": "#090a10",
      "icon": "×"
    },
    "fixed": {
      "color": "#a2a5b2",
      "icon": "▣"
    },
    "silhouette": "M50 3c-8 0-14 6-14 14-3-1-4 3-2 6l4 5c1 3 4 5 6 7v4c-1 4-8 5-15 8-7 3-10 8-11 15l-3 12-5 14c-2 6-2 10 2 12 2 1 4-1 3-3l-1-4 3-6 5-13 4-14 4 11c1 6-2 11-4 17l-1 12h22l3-6 3 6h22l-1-12c-2-6-5-11-4-17l4-11 4 14 5 13 3 6-1 4c-1 2 1 4 3 3 4-2 4-6 2-12l-5-14-3-12c-1-7-4-12-11-15-7-3-14-4-15-8v-4c2-2 5-4 6-7l4-5c2-3 1-7-2-6 0-8-6-14-14-14Z",
    "viewBox": "0 0 256 256",
    "placement": "translate(77 4) scale(1.68)",
    "leftX": 34,
    "leftMaxStep": 79,
    "leftHeight": 176,
    "leftArea": 190,
    "leftBaseline": 0.83,
    "leftMaxFont": 70,
    "leftFontScale": 1.1,
    "bottomX": 7,
    "bottomY": 242,
    "bottomWidth": 242,
    "bottomMaxFont": 94,
    "bottomFontBudget": 310
  },
  "families": [
    {
      "id": "group-1",
      "organ": "Heart",
      "condition": "Benign\nearly beats",
      "care": "Less\ncaffeine",
      "source": "https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia/premature-contractions-pacs-and-pvcs",
      "note": "Reducing caffeine may help when it triggers premature beats.",
      "tileColor": "#00BA9D",
      "art": {
        "color": "#F5222D",
        "path": "M52 62c-7-10-19-4-17 6 1 10 10 17 23 24 9-11 13-23 8-29-3-5-9-5-14-1Z",
        "placement": "translate(20 27) scale(.6 .48)",
        "leftText": "HE",
        "bottomText": "ART"
      }
    },
    {
      "id": "group-2",
      "organ": "Brain",
      "condition": "Tension\nheadache",
      "care": "Topical\npeppermint",
      "source": "https://www.nccih.nih.gov/health/peppermint-oil",
      "note": "Limited evidence suggests topical peppermint oil may help.",
      "tileColor": "#BCE943",
      "art": {
        "color": "#FF8A65",
        "path": "M48 14c-5-4-12 0-13 5-5 1-7 7-4 11-2 5 1 9 5 10 2 5 9 6 12 2Zm4 0c5-4 12 0 13 5 5 1 7 7 4 11 2 5-1 9-5 10-2 5-9 6-12 2Z",
        "placement": "translate(21 7) scale(.58 .44)",
        "leftText": "BR",
        "bottomText": "AIN"
      }
    },
    {
      "id": "group-3",
      "organ": "Lung",
      "condition": "Dry\ncough",
      "care": "Marshmallow\nroot",
      "source": "https://www.ema.europa.eu/en/medicines/herbal/althaeae-radix",
      "note": "Traditionally used for throat irritation with a dry cough.",
      "tileColor": "#9CEAFF",
      "art": {
        "color": "#35B5F7",
        "path": "M48 54h4v15h-4ZM44 59c-7-4-19 12-20 26-1 9 8 10 20 6Zm12 0c7-4 19 12 20 26 1 9-8 10-20 6Z",
        "placement": "translate(20 27) scale(.6 .48)",
        "leftText": "LU",
        "bottomText": "NG"
      }
    },
    {
      "id": "group-4",
      "organ": "Liver",
      "condition": "Gilbert\nsyndrome",
      "care": "No treatment\nneeded",
      "source": "https://www.nhs.uk/conditions/gilberts-syndrome/",
      "tileColor": "#378DFF",
      "art": {
        "color": "#8E24AA",
        "path": "M23 61c9-9 34-10 45-4-4 8-19 10-31 18-7 4-15-4-14-14Z",
        "placement": "translate(21 29) scale(.58 .5)",
        "leftText": "LI",
        "bottomText": "VER"
      }
    },
    {
      "id": "group-5",
      "organ": "Kidney",
      "condition": "Simple\nkidney cyst",
      "care": "Observation",
      "source": "https://www.niddk.nih.gov/health-information/kidney-disease/simple-kidney-cysts",
      "note": "Simple cysts without symptoms usually need no treatment.",
      "tileColor": "#A48AFF",
      "art": {
        "color": "#E53935",
        "path": "M35 47c-10-4-16 14-12 22 3 6 12 4 13-2 1-4-5-5-3-9s8-7 2-11Zm30 0c10-4 16 14 12 22-3 6-12 4-13-2-1-4 5-5 3-9s-8-7-2-11Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "KID",
        "bottomText": "NEY"
      }
    },
    {
      "id": "group-6",
      "organ": "Stomach",
      "condition": "Motion\nsickness",
      "care": "Ginger\nroot",
      "source": "https://www.ema.europa.eu/en/documents/herbal-summary/ginger-summary-public_en.pdf",
      "note": "Some ginger preparations are used for prevention of motion sickness symptoms.",
      "tileColor": "#FF922E",
      "art": {
        "color": "#00BFA5",
        "path": "M50 39h5v12c6-6 18-7 20 4 3 15-13 28-28 23-7-2-8-9-3-12 4-2 8 2 9-5 1-5-3-6-3-11Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "STO",
        "bottomText": "MACH"
      }
    },
    {
      "id": "group-7",
      "organ": "Pancreas",
      "condition": "Mild low\nblood sugar",
      "care": "Fast-acting\ncarbs",
      "source": "https://www.cdc.gov/diabetes/treatment/treatment-low-blood-sugar-hypoglycemia.html",
      "note": "An example of care for mild low blood sugar in a person who can swallow safely.",
      "tileColor": "#FF527B",
      "art": {
        "color": "#FFB300",
        "path": "M27 62c0-6 7-9 13-6 7 2 16-1 23-5 9-4 14-3 16 0-8 5-12 12-23 13-10 0-13 8-22 8-5 0-8-4-7-10Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "PAN",
        "bottomText": "CREAS"
      }
    },
    {
      "id": "group-8",
      "organ": "Spleen",
      "condition": "Symptom-free\nsplenic cyst",
      "care": "Monitoring",
      "source": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10396346/",
      "note": "Observation may be appropriate for selected simple, nonparasitic cysts.",
      "tileColor": "#BC46EF",
      "art": {
        "color": "#AB47BC",
        "path": "M74 44c8-2 10 5 7 12-3 5-9 13-13 10-5-5 1-19 6-22Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "SPL",
        "bottomText": "EEN"
      }
    },
    {
      "id": "group-9",
      "organ": "Skin",
      "condition": "Mild itchy\neczema",
      "care": "Oatmeal\nbath",
      "source": "https://www.aad.org/public/diseases/eczema/childhood/itch-relief/home-remedies",
      "note": "Colloidal oatmeal can soothe itching.",
      "tileColor": "#25C760",
      "art": {
        "color": "#FF9B28",
        "path": "M15 59c5-6 11-9 21-12l2 9c-10 2-16 5-21 10l-4 17-8-2Zm70 0c-5-6-11-9-21-12l-2 9c10 2 16 5 21 10l4 17 8-2Z",
        "placement": "translate(20 27) scale(.6 .48)",
        "leftText": "SK",
        "bottomText": "IN"
      }
    },
    {
      "id": "group-10",
      "organ": "Bladder",
      "condition": "Recurrent\nUTI risk",
      "care": "Cranberry\nprevention",
      "source": "https://www.nccih.nih.gov/health/cranberry",
      "note": "Cranberry may help prevent repeat infections in some people. An active infection needs separate evaluation and care.",
      "tileColor": "#DCC4FF",
      "art": {
        "color": "#D6336C",
        "path": "M36 78c0-8 28-8 28 0 0 8-5 13-12 14v5h-4v-5c-7-1-12-6-12-14Z",
        "placement": "translate(21 36) scale(.58 .58)",
        "leftText": "BLA",
        "bottomText": "DDER"
      }
    },
    {
      "id": "group-11",
      "organ": "Small\nintestine",
      "condition": "Lactose\nintolerance",
      "care": "Lactose-free\nfoods",
      "source": "https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance/treatment",
      "tileColor": "#F54232",
      "art": {
        "color": "#00C9B7",
        "path": "M28 51h41a7 7 0 0 1 0 14H35a2 2 0 0 0 0 4h29a7 7 0 0 1 0 14H51v8h-5V78h18a2 2 0 0 0 0-4H35a7 7 0 0 1 0-14h34a2 2 0 0 0 0-4H28Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "SMALL",
        "bottomText": "INTESTINE"
      }
    },
    {
      "id": "group-12",
      "organ": "Large\nintestine",
      "condition": "Mild IBS\ncramps",
      "care": "Peppermint\noil capsules",
      "source": "https://www.nccih.nih.gov/health/peppermint-oil",
      "note": "Enteric-coated peppermint oil may ease IBS symptoms.",
      "tileColor": "#FFD23F",
      "art": {
        "color": "#834CF1",
        "path": "M26 50c0-5 4-9 9-9h31c6 0 10 4 10 10v25c0 8-7 12-16 12h-5v9h-7V86c0-4 3-6 7-6h5c5 0 9-2 9-5V51c0-2-1-3-3-3H35c-1 0-2 1-2 3v25h-7Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "LARGE",
        "bottomText": "INTESTINE"
      }
    },
    {
      "id": "group-13",
      "organ": "Thyroid\ngland",
      "condition": "Benign\nthyroid nodule",
      "care": "Ultrasound\nfollow-up",
      "source": "https://www.thyroid.org/thyroid-nodules/",
      "tileColor": "#6DCEE5",
      "art": {
        "color": "#E82D81",
        "path": "M49 44c-6-11-12-11-13-2-2 9 4 17 10 10l4-4 4 4c6 7 12-1 10-10-1-9-7-9-13 2Z",
        "placement": "translate(24 15) scale(.52 .52)",
        "leftText": "THYROID",
        "bottomText": "GLAND"
      }
    },
    {
      "id": "group-14",
      "organ": "Adrenal\ngland",
      "condition": "Benign adrenal\nnodule",
      "care": "Clinical\nobservation",
      "source": "https://ensat.org/wp-content/uploads/2025/12/Fassnacht-Incidentaloma-Guideline-EJE-2023.pdf",
      "note": "Clearly benign, nonfunctioning nodules generally need no treatment after assessment.",
      "tileColor": "#E82DAA",
      "art": {
        "color": "#FF7043",
        "path": "M22 48c3-8 7-11 13-11l7 10c-7-2-14-1-20 1Zm56 0c-3-8-7-11-13-11l-7 10c7-2 14-1 20 1Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "ADRENAL",
        "bottomText": "GLAND"
      }
    },
    {
      "id": "group-15",
      "organ": "Pituitary\ngland",
      "condition": "Small silent\npituitary lesion",
      "care": "MRI\nfollow-up",
      "source": "https://academic.oup.com/jcem/article/96/4/894/2720833",
      "note": "Follow-up depends on the type and size of the lesion.",
      "tileColor": "#81A868",
      "art": {
        "color": "#FFD54F",
        "path": "M48 31h4v10c6 1 9 7 6 12-3 6-13 6-16 0-3-5 0-11 6-12Z",
        "placement": "translate(21 7) scale(.58 .44)",
        "leftText": "PITUITARY",
        "bottomText": "GLAND"
      }
    },
    {
      "id": "group-16",
      "organ": "Gallbladder",
      "condition": "Silent\ngallstones",
      "care": "No treatment\nneeded",
      "source": "https://www.niddk.nih.gov/health-information/digestive-diseases/gallstones/treatment/",
      "tileColor": "#FFF0BB",
      "art": {
        "color": "#09C66B",
        "path": "M38 48h4v8c0 6 7 8 7 16a8 8 0 0 1-16 0c0-8 5-11 5-16Z",
        "placement": "translate(25 41) scale(.5 .48)",
        "leftText": "GALL",
        "bottomText": "BLADDER"
      }
    },
    {
      "id": "group-17",
      "organ": "Pineal\ngland",
      "condition": "Incidental\npineal cyst",
      "care": "Observation",
      "source": "https://www.uhs.nhs.uk/Media/UHS-website-2019/Patientinformation/Brain-and-spine/Incidental-pineal-cyst-3720-PIL.pdf",
      "note": "A typical cyst found incidentally usually needs no treatment.",
      "tileColor": "#C88961",
      "art": {
        "color": "#FF527B",
        "path": "M50 26c4 4 10 11 10 16a10 10 0 0 1-20 0c0-5 6-12 10-16Z",
        "placement": "translate(21 7) scale(.58 .44)",
        "leftText": "PINEAL",
        "bottomText": "GLAND"
      }
    },
    {
      "id": "group-18",
      "organ": "Thymus",
      "condition": "Age-related\nshrinkage",
      "care": "No treatment\nneeded",
      "source": "https://pubmed.ncbi.nlm.nih.gov/4081647/",
      "note": "Thymus shrinkage is a normal change with age.",
      "tileColor": "#F0F4F8",
      "art": {
        "color": "#7ED321",
        "path": "M50 56c-7-11-14-4-14 8 0 10 6 18 10 18 3 0 4-6 4-10 0 4 1 10 4 10 4 0 10-8 10-18 0-12-7-19-14-8Z",
        "placement": "translate(20 27) scale(.6 .48)",
        "leftText": "THY",
        "bottomText": "MUS"
      }
    },
    {
      "id": "group-19",
      "organ": "Tongue",
      "condition": "Minor mouth\nirritation",
      "care": "Sage leaf\nrinse",
      "source": "https://www.ema.europa.eu/en/documents/herbal-report/final-assessment-report-salvia-officinalis-l-folium-and-salvia-officinalis-l-aetheroleum-revision-1_en.pdf",
      "note": "Traditional use for minor mouth irritation.",
      "tileColor": "#FFB4D8",
      "art": {
        "color": "#F44336",
        "path": "M38 49c7 2 17 2 24 0v8a12 12 0 0 1-24 0Z",
        "placement": "translate(21 7) scale(.58 .44)",
        "leftText": "TON",
        "bottomText": "GUE"
      }
    },
    {
      "id": "group-20",
      "organ": "Eye",
      "condition": "Mild eye\nallergy",
      "care": "Cool\ncompress",
      "source": "https://www.aao.org/eye-health/ask-ophthalmologist-q/itchy-eyes-treatment",
      "tileColor": "#AAB7C8",
      "art": {
        "color": "#168CF5",
        "path": "M51 34c6-7 14-7 20 0-6 7-14 7-20 0Zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0Z",
        "placement": "translate(21 7) scale(.58 .44)",
        "leftText": "E",
        "bottomText": "YE"
      }
    }
  ]
};
