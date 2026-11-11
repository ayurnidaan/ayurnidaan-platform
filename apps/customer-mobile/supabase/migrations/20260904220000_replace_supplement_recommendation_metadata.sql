-- Replace the supplement recommendation metadata with the product team's
-- authoritative VIKRITI_CORE_V1.0 inventory.
begin;

create temporary table supplement_inventory_update on commit drop as
select
  item->>'name' as name,
  item->>'primary_category' as primary_category,
  item->'for_symptoms' as for_symptoms,
  array(select jsonb_array_elements_text(item->'pacifies')) as pacifies,
  array(select jsonb_array_elements_text(item->'may_aggravate')) as may_aggravate
from jsonb_array_elements(($inventory${
  "products": [
    {
      "name": "Ashwagandha",
      "primary_category": "Energy & Vitality",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Shatavari",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q6:THIRST_HIGH",
        "Q3:STOOL_DRY_HARD",
        "Q2:POSTMEAL_BURNING",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Guduchi (Giloy)",
      "primary_category": "Immunity & Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q6:THIRST_HIGH",
        "Q2:POSTMEAL_BURNING",
        "Q4:URINE_DARK_BURNING",
        "Q6:THIRST_VARIABLE"
      ],
      "pacifies": ["Pitta", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Amalaki",
      "primary_category": "Immunity & Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q6:THIRST_HIGH",
        "Q3:STOOL_LOOSE_BURNING",
        "Q2:POSTMEAL_BURNING",
        "Q4:URINE_DARK_BURNING",
        "Q6:THIRST_VARIABLE",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Pitta", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Haritaki",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Vata", "Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Bibhitaki",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q3:STOOL_LOOSE_BURNING"
      ],
      "pacifies": ["Kapha", "Pitta"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Brahmi",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Shankhpushpi",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Yashtimadhu (Licorice)",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q3:STOOL_LOOSE_BURNING",
        "Q2:POSTMEAL_BURNING",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Tulsi",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Gokshura",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q4:URINE_DARK_BURNING"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Punarnava",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_STICKY_HEAVY",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Arjuna",
      "primary_category": "Heart & Circulatory Health",
      "for_symptoms": [],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Neem",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q6:THIRST_HIGH",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Turmeric (Haridra)",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Ginger (Shunthi)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Black Pepper (Maricha)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Long Pepper (Pippali)",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Cinnamon (Tvak)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Cardamom (Ela)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Clove (Lavanga)",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Fennel (Shatapushpa)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q1:APPETITE_STRONG",
        "Q3:STOOL_LOOSE_BURNING",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_BURNING",
        "Q6:THIRST_VARIABLE"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Cumin (Jiraka)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Fenugreek (Methi)",
      "primary_category": "Weight & Metabolism",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Ajwain (Yavani)",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Triphala",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Vata", "Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Hing",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Chitrak",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Musta",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q3:STOOL_LOOSE_BURNING",
        "Q5:SWEAT_HIGH_HOT",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Bilva",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_LOOSE_BURNING",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE",
        "Q2:POSTMEAL_BLOATING"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Dadima",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q3:STOOL_LOOSE_BURNING"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Kutaja",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_LOOSE_BURNING",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Vasaka (Vasa)",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Kantakari",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Pushkaramula",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Bharangi",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Talisapatra",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Jatamansi",
      "primary_category": "Stress & Sleep",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Vacha",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q1:APPETITE_VARIABLE"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Mandukaparni",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Jyotishmati",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q1:APPETITE_VARIABLE"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Tagara",
      "primary_category": "Stress & Sleep",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Varuna",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Pashanabheda",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q4:URINE_DARK_BURNING"
      ],
      "pacifies": ["Kapha", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Ikshu",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q4:URINE_FREQUENT_INCREASED"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Ushira",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_FREQUENT_INCREASED",
        "Q6:THIRST_HIGH",
        "Q4:URINE_DARK_BURNING",
        "Q6:THIRST_VARIABLE"
      ],
      "pacifies": ["Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Ashoka",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Lodhra",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q5:SWEAT_HIGH_HOT",
        "Q3:STOOL_LOOSE_BURNING",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Kumari (Aloe Vera)",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Bala",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Manjistha",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Sariva",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Khadira",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Kapha", "Pitta"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Bakuchi",
      "primary_category": "Skin & Hair",
      "for_symptoms": [],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Triphala Churna",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Vata", "Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Trikatu Churna",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Chyawanprash",
      "primary_category": "Immunity & Wellness",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Ashwagandha Churna",
      "primary_category": "Energy & Vitality",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Sitopaladi Churna",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Talisadi Churna",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Avipattikar Churna",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q3:STOOL_LOOSE_BURNING",
        "Q2:POSTMEAL_BURNING"
      ],
      "pacifies": ["Pitta", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Hingvastak Churna",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Sudarshan Churna",
      "primary_category": "Immunity & Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Dashamoola Churna",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Brahmi Churna",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Shatavari Churna",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q6:THIRST_HIGH",
        "Q3:STOOL_DRY_HARD",
        "Q2:POSTMEAL_BURNING",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Arjuna Churna",
      "primary_category": "Heart & Circulatory Health",
      "for_symptoms": [],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Arogyavardhini Vati",
      "primary_category": "General Wellness",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q1:APPETITE_VARIABLE",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_HEAVINESS"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Chandraprabha Vati",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q4:URINE_DARK_BURNING"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Yogaraja Guggulu",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Triphala Guggulu",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q3:STOOL_STICKY_HEAVY",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Kanchanara Guggulu",
      "primary_category": "General Wellness",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Punarnavadi Guggulu",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Kapha", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Kaishore Guggulu",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": ["Vata"]
    },
    {
      "name": "Gokshuradi Guggulu",
      "primary_category": "Urinary & Kidney Health",
      "for_symptoms": [
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q4:URINE_DARK_BURNING"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Ashwagandharishta",
      "primary_category": "Energy & Vitality",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Arjunarishta",
      "primary_category": "Heart & Circulatory Health",
      "for_symptoms": [],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Dashamularishta",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Draksharishta",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q6:THIRST_LOW_HEAVY"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Abhayarishta",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q3:STOOL_VARIABLE"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": []
    },
    {
      "name": "Kumaryasava",
      "primary_category": "Women's Wellness",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Saraswatarishta",
      "primary_category": "Cognitive & Memory",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Balarishta",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Jeerakadyarishta",
      "primary_category": "Digestive Health",
      "for_symptoms": [
        "Q1:APPETITE_VARIABLE",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q1:APPETITE_LOW",
        "Q2:POSTMEAL_BLOATING"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Amritarishta",
      "primary_category": "Immunity & Wellness",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT"
      ],
      "pacifies": ["Pitta", "Kapha"],
      "may_aggravate": []
    },
    {
      "name": "Sesame Oil (Tila Taila)",
      "primary_category": "General Wellness",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Pitta", "Kapha"]
    },
    {
      "name": "Coconut Oil",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q1:APPETITE_STRONG",
        "Q5:SWEAT_HIGH_HOT",
        "Q5:SWEAT_STICKY_HEAVY"
      ],
      "pacifies": ["Pitta"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Mahanarayan Taila",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": []
    },
    {
      "name": "Dhanwantharam Taila",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": []
    },
    {
      "name": "Kottamchukkadi Taila",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY",
        "Q4:URINE_REDUCED_IRREGULAR"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Brahmi Taila",
      "primary_category": "Stress & Sleep",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": []
    },
    {
      "name": "Bhringraj Taila",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Pitta", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Neelibhringadi Taila",
      "primary_category": "Skin & Hair",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Pitta", "Vata"],
      "may_aggravate": []
    },
    {
      "name": "Bala Taila",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q4:URINE_REDUCED_IRREGULAR",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Ksheerabala Taila",
      "primary_category": "Joint & Muscle Health",
      "for_symptoms": [
        "Q3:STOOL_DRY_HARD",
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q5:SWEAT_LOW_DRY"
      ],
      "pacifies": ["Vata"],
      "may_aggravate": ["Kapha"]
    },
    {
      "name": "Anu Taila",
      "primary_category": "Respiratory Health",
      "for_symptoms": [
        "Q7:SLEEP_EXCESS_HEAVY"
      ],
      "pacifies": ["Vata", "Kapha"],
      "may_aggravate": ["Pitta"]
    },
    {
      "name": "Jatamansi Taila",
      "primary_category": "Stress & Sleep",
      "for_symptoms": [
        "Q7:SLEEP_LIGHT_DISTURBED",
        "Q7:SLEEP_LOW_HOT"
      ],
      "pacifies": ["Vata", "Pitta"],
      "may_aggravate": ["Kapha"]
    }
  ]
}$inventory$::jsonb)->'products') as product(item);

do $validation$
begin
  if (select count(*) from supplement_inventory_update) <> 97 then
    raise exception 'Expected 97 products in the supplement inventory update';
  end if;

  if exists (
    select name
    from supplement_inventory_update
    group by name
    having count(*) > 1
  ) then
    raise exception 'The supplement inventory update contains duplicate product names';
  end if;

  if exists (
    select 1
    from supplement_inventory_update source
    left join public.shop_products target on target.name = source.name
    where target.id is null
  ) then
    raise exception 'The supplement inventory update contains an unknown product';
  end if;

  if exists (
    select 1
    from supplement_inventory_update product
    cross join lateral jsonb_array_elements(product.for_symptoms) as symptom(answer_id)
    where jsonb_typeof(symptom.answer_id) <> 'string'
       or symptom.answer_id #>> '{}' not in (
         'Q1:APPETITE_VARIABLE',
         'Q1:APPETITE_STRONG',
         'Q1:APPETITE_LOW',
         'Q2:POSTMEAL_BLOATING',
         'Q2:POSTMEAL_BURNING',
         'Q2:POSTMEAL_HEAVINESS',
         'Q3:STOOL_DRY_HARD',
         'Q3:STOOL_LOOSE_BURNING',
         'Q3:STOOL_STICKY_HEAVY',
         'Q3:STOOL_VARIABLE',
         'Q4:URINE_REDUCED_IRREGULAR',
         'Q4:URINE_DARK_BURNING',
         'Q4:URINE_FREQUENT_INCREASED',
         'Q5:SWEAT_LOW_DRY',
         'Q5:SWEAT_HIGH_HOT',
         'Q5:SWEAT_STICKY_HEAVY',
         'Q6:THIRST_VARIABLE',
         'Q6:THIRST_HIGH',
         'Q6:THIRST_LOW_HEAVY',
         'Q7:SLEEP_LIGHT_DISTURBED',
         'Q7:SLEEP_LOW_HOT',
         'Q7:SLEEP_EXCESS_HEAVY'
       )
  ) then
    raise exception 'The supplement inventory update contains an invalid Vikriti answer ID';
  end if;
end
$validation$;

update public.shop_products target
set
  primary_category = source.primary_category,
  for_symptoms = source.for_symptoms,
  pacifies = source.pacifies,
  may_aggravate = source.may_aggravate,
  updated_at = now()
from supplement_inventory_update source
where target.name = source.name;

commit;

