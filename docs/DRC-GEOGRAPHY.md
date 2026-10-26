# DRC geographic hierarchy: provinces, villes, Kinshasa districts and communes

Compiled 2026-10-26 for the Somba warehouse-by-area routing. Machine-readable twin of this file: `api/src/database/geo/drc.json` (both are generated from the same data, so they cannot disagree).

Rule followed throughout: accuracy over completeness. Anything that could not be confirmed is flagged, never filled in. Where two sources disagree the disagreement is written down in section 8.

## 1. Summary

| Item | Result |
|---|---|
| Provinces | **26** (25 provinces + Kinshasa ville-province), ISO 3166-2:CD codes verified against two sources |
| City records in the dataset | **38**: 34 `official` (the 33 villes of the CENI 2023 list + Kinshasa) and 4 `decree-2013` |
| Owner list | 33 names: 29 confirmed `official`, 4 only `decree-2013` (Baraka, Bumba, Kongolo, Muanda) |
| Cities added to the owner list | **5**: Buta, Bunia, Tshikapa, Lumumbaville, Boende (flagged `inOwnerList: false`, see section 4) |
| Kinshasa | 4 districts (Funa 7, Lukunga 7, Mont-Amba 5, Tshangu 5 communes) and **24** communes |
| Quartiers | **0 imported**: no reliable, complete, consistent source exists (section 6). Every commune has `quartiers: []` |
| Codes | Provinces: official ISO 3166-2:CD. Cities, districts, communes: **internal codes, not official** (section 7) |

How to use the JSON: filter `status === "official"` for the strict official list; keep `decree-2013` entries only if the business wants Baraka, Bumba, Kongolo and Muanda; `inOwnerList === false` marks what was added to your list.

## 2. Provinces (26)

Codes: ISO 3166-2:CD. French names: ISO spelling (the Loi organique 15/006 writes some without accent or hyphen, see section 8). Capital: chef-lieu fixed by Loi organique n° 15/006 of 25 March 2015. English names are the "reference only" column of ISO 3166-2:CD (not part of the standard). Capital coordinates are those of the capital city (section 3).

| # | ISO 3166-2 | Name (FR) | English (ISO ref.) | Capital (chef-lieu) | Capital lat | Capital lng | Former province |
|---|---|---|---|---|---|---|---|
| 1 | CD-BC | Kongo Central | Central Kongo | Matadi | -5.8167 | 13.4833 | Bas-Congo |
| 2 | CD-BU | Bas-Uélé | Lower Uele | Buta | 2.8000 | 24.7333 | Orientale |
| 3 | CD-EQ | Équateur | Equator | Mbandaka | 0.0478 | 18.2558 | Équateur |
| 4 | CD-HK | Haut-Katanga | Upper Katanga | Lubumbashi | -11.6642 | 27.4828 | Katanga |
| 5 | CD-HL | Haut-Lomami | Upper Lomami | Kamina | -8.7386 | 24.9906 | Katanga |
| 6 | CD-HU | Haut-Uélé | Upper Uele | Isiro | 2.7833 | 27.6167 | Orientale |
| 7 | CD-IT | Ituri | Ituri | Bunia | 1.5667 | 30.2500 | Orientale |
| 8 | CD-KC | Kasaï Central | Central Kasai | Kananga | -5.8970 | 22.4488 | Kasaï-Occidental |
| 9 | CD-KE | Kasaï Oriental | Eastern Kasai | Mbuji-Mayi | -6.1261 | 23.5997 | Kasaï-Oriental |
| 10 | CD-KG | Kwango | Kwango | Kenge | -4.8056 | 17.0417 | Bandundu |
| 11 | CD-KL | Kwilu | Kwilu | Bandundu | -3.3167 | 17.3667 | Bandundu |
| 12 | CD-KN | Kinshasa | Kinshasa | Kinshasa | -4.3219 | 15.3119 | Kinshasa (ville-province) |
| 13 | CD-KS | Kasaï | Kasai | Tshikapa | -6.4167 | 20.8000 | Kasaï-Occidental |
| 14 | CD-LO | Lomami | Lomami | Kabinda | -6.1300 | 24.4800 | Kasaï-Oriental |
| 15 | CD-LU | Lualaba | Lualaba | Kolwezi | -10.7167 | 25.4667 | Katanga |
| 16 | CD-MA | Maniema | Maniema | Kindu | -2.9500 | 25.9500 | Maniema |
| 17 | CD-MN | Mai-Ndombe | Mai-Ndombe | Inongo | -1.9500 | 18.2667 | Bandundu |
| 18 | CD-MO | Mongala | Mongala | Lisala | 2.1486 | 21.5136 | Équateur |
| 19 | CD-NK | Nord-Kivu | North Kivu | Goma | -1.6794 | 29.2336 | Nord-Kivu |
| 20 | CD-NU | Nord-Ubangi | North Ubangi | Gbadolite | 4.2833 | 21.0167 | Équateur |
| 21 | CD-SA | Sankuru | Sankuru | Lusambo | -4.9729 | 23.4368 | Kasaï-Oriental |
| 22 | CD-SK | Sud-Kivu | South Kivu | Bukavu | -2.5061 | 28.8608 | Sud-Kivu |
| 23 | CD-SU | Sud-Ubangi | South Ubangi | Gemena | 3.2500 | 19.7667 | Équateur |
| 24 | CD-TA | Tanganyika | Tanganyika | Kalemie | -5.9128 | 29.1906 | Katanga |
| 25 | CD-TO | Tshopo | Tshopo | Kisangani | 0.5167 | 25.2000 | Orientale |
| 26 | CD-TU | Tshuapa | Tshuapa | Boende | -0.2810 | 20.8760 | Équateur |

Sources: S01, S02 (codes and ISO names), S03 (names and capitals, primary law), S04, S05 (capital cross-check), S06 (cross-check, outdated for Kasaï and Kwilu).

## 3. Cities (38 records)

`Capital` = chef-lieu of its province (Loi organique 15/006). `Status`: `official` = in the CENI 2023 list of 33 villes or Kinshasa; `decree-2013` = ville status conferred by the decrees of 13 June 2013 only (see section 4). `In owner list: NO (added)` = not in the list you supplied. Coordinates: city centre, about 1-3 km accuracy (many sources round to the arc-minute). Internal codes: section 7.

| # | Internal code | City | Province | Capital | Lat | Lng | Status | In owner list |
|---|---|---|---|---|---|---|---|---|
| 1 | CD-BC-MAT | Matadi | Kongo Central (CD-BC) | yes | -5.8167 | 13.4833 | official | yes |
| 2 | CD-BC-BOM | Boma | Kongo Central (CD-BC) |  | -5.8500 | 13.0500 | official | yes |
| 3 | CD-BC-MUA | Muanda | Kongo Central (CD-BC) |  | -5.9342 | 12.3495 | decree-2013 | yes |
| 4 | CD-BU-BUT | Buta | Bas-Uélé (CD-BU) | yes | 2.8000 | 24.7333 | official | **NO (added)** |
| 5 | CD-EQ-MBA | Mbandaka | Équateur (CD-EQ) | yes | 0.0478 | 18.2558 | official | yes |
| 6 | CD-HK-LUB | Lubumbashi | Haut-Katanga (CD-HK) | yes | -11.6642 | 27.4828 | official | yes |
| 7 | CD-HK-LIK | Likasi | Haut-Katanga (CD-HK) |  | -10.9833 | 26.7333 | official | yes |
| 8 | CD-HL-KAM | Kamina | Haut-Lomami (CD-HL) | yes | -8.7386 | 24.9906 | official | yes |
| 9 | CD-HU-ISI | Isiro | Haut-Uélé (CD-HU) | yes | 2.7833 | 27.6167 | official | yes |
| 10 | CD-IT-BUN | Bunia | Ituri (CD-IT) | yes | 1.5667 | 30.2500 | official | **NO (added)** |
| 11 | CD-KC-KAN | Kananga | Kasaï Central (CD-KC) | yes | -5.8970 | 22.4488 | official | yes |
| 12 | CD-KE-MBM | Mbuji-Mayi | Kasaï Oriental (CD-KE) | yes | -6.1261 | 23.5997 | official | yes |
| 13 | CD-KG-KEN | Kenge | Kwango (CD-KG) | yes | -4.8056 | 17.0417 | official | yes |
| 14 | CD-KL-BAN | Bandundu | Kwilu (CD-KL) | yes | -3.3167 | 17.3667 | official | yes |
| 15 | CD-KL-KIK | Kikwit | Kwilu (CD-KL) |  | -5.0386 | 18.8181 | official | yes |
| 16 | CD-KN-KIN | Kinshasa | Kinshasa (CD-KN) | yes | -4.3219 | 15.3119 | official | yes |
| 17 | CD-KS-TSH | Tshikapa | Kasaï (CD-KS) | yes | -6.4167 | 20.8000 | official | **NO (added)** |
| 18 | CD-LO-KAB | Kabinda | Lomami (CD-LO) | yes | -6.1300 | 24.4800 | official | yes |
| 19 | CD-LO-MWD | Mwene-Ditu | Lomami (CD-LO) |  | -7.0000 | 23.4500 | official | yes |
| 20 | CD-LU-KOL | Kolwezi | Lualaba (CD-LU) | yes | -10.7167 | 25.4667 | official | yes |
| 21 | CD-MA-KIN | Kindu | Maniema (CD-MA) | yes | -2.9500 | 25.9500 | official | yes |
| 22 | CD-MN-INO | Inongo | Mai-Ndombe (CD-MN) | yes | -1.9500 | 18.2667 | official | yes |
| 23 | CD-MO-LIS | Lisala | Mongala (CD-MO) | yes | 2.1486 | 21.5136 | official | yes |
| 24 | CD-MO-BUM | Bumba | Mongala (CD-MO) |  | 2.1844 | 22.4703 | decree-2013 | yes |
| 25 | CD-NK-GOM | Goma | Nord-Kivu (CD-NK) | yes | -1.6794 | 29.2336 | official | yes |
| 26 | CD-NK-BEN | Beni | Nord-Kivu (CD-NK) |  | 0.5000 | 29.4667 | official | yes |
| 27 | CD-NK-BTM | Butembo | Nord-Kivu (CD-NK) |  | 0.1500 | 29.2833 | official | yes |
| 28 | CD-NU-GBA | Gbadolite | Nord-Ubangi (CD-NU) | yes | 4.2833 | 21.0167 | official | yes |
| 29 | CD-SA-LUS | Lusambo | Sankuru (CD-SA) | yes | -4.9729 | 23.4368 | official | yes |
| 30 | CD-SA-LMV | Lumumbaville | Sankuru (CD-SA) |  | -4.0748 | 24.5515 | official | **NO (added)** |
| 31 | CD-SK-BUK | Bukavu | Sud-Kivu (CD-SK) | yes | -2.5061 | 28.8608 | official | yes |
| 32 | CD-SK-BAR | Baraka | Sud-Kivu (CD-SK) |  | -4.1041 | 29.0940 | decree-2013 | yes |
| 33 | CD-SU-GEM | Gemena | Sud-Ubangi (CD-SU) | yes | 3.2500 | 19.7667 | official | yes |
| 34 | CD-SU-ZON | Zongo | Sud-Ubangi (CD-SU) |  | 4.3433 | 18.5928 | official | yes |
| 35 | CD-TA-KAL | Kalemie | Tanganyika (CD-TA) | yes | -5.9128 | 29.1906 | official | yes |
| 36 | CD-TA-KON | Kongolo | Tanganyika (CD-TA) |  | -5.4000 | 27.0000 | decree-2013 | yes |
| 37 | CD-TO-KIS | Kisangani | Tshopo (CD-TO) | yes | 0.5167 | 25.2000 | official | yes |
| 38 | CD-TU-BOE | Boende | Tshuapa (CD-TU) | yes | -0.2810 | 20.8760 | official | **NO (added)** |

Sources: S07 (list of 33 villes), S08 (province of each ville), S03 (capitals), S10 (decrees of 2013), S09 and S11 (history), S21 (coordinates).

## 4. Discrepancies against the owner list

### 4.1 Owner list, name by name

| Owner list name | Result in dataset | Province | Internal code |
|---|---|---|---|
| Bandundu | Confirmed (CENI 2023 list) | Kwilu | CD-KL-BAN |
| Baraka | Decree 2013 only, not in CENI 2023 list: UNVERIFIED current status | Sud-Kivu | CD-SK-BAR |
| Beni | Confirmed (CENI 2023 list) | Nord-Kivu | CD-NK-BEN |
| Boma | Confirmed (CENI 2023 list) | Kongo Central | CD-BC-BOM |
| Bukavu | Confirmed (CENI 2023 list) | Sud-Kivu | CD-SK-BUK |
| Butembo | Confirmed (CENI 2023 list) | Nord-Kivu | CD-NK-BTM |
| Bumba | Decree 2013 only, not in CENI 2023 list: UNVERIFIED current status | Mongala | CD-MO-BUM |
| Gbadolite | Confirmed (CENI 2023 list) | Nord-Ubangi | CD-NU-GBA |
| Gemena | Confirmed (CENI 2023 list) | Sud-Ubangi | CD-SU-GEM |
| Goma | Confirmed (CENI 2023 list) | Nord-Kivu | CD-NK-GOM |
| Inongo | Confirmed (CENI 2023 list) | Mai-Ndombe | CD-MN-INO |
| Isiro | Confirmed (CENI 2023 list) | Haut-Uélé | CD-HU-ISI |
| Kabinda | Confirmed (CENI 2023 list) | Lomami | CD-LO-KAB |
| Kalemie | Confirmed (CENI 2023 list) | Tanganyika | CD-TA-KAL |
| Kamina | Confirmed (CENI 2023 list) | Haut-Lomami | CD-HL-KAM |
| Kananga | Confirmed (CENI 2023 list) | Kasaï Central | CD-KC-KAN |
| Kenge | Confirmed (CENI 2023 list) | Kwango | CD-KG-KEN |
| Kikwit | Confirmed (CENI 2023 list) | Kwilu | CD-KL-KIK |
| Kindu | Confirmed (CENI 2023 list) | Maniema | CD-MA-KIN |
| Kinshasa | Confirmed (CENI 2023 list; ville-province) | Kinshasa | CD-KN-KIN |
| Kisangani | Confirmed (CENI 2023 list) | Tshopo | CD-TO-KIS |
| Kolwezi | Confirmed (CENI 2023 list) | Lualaba | CD-LU-KOL |
| Kongolo | Decree 2013 only, not in CENI 2023 list: UNVERIFIED current status | Tanganyika | CD-TA-KON |
| Likasi | Confirmed (CENI 2023 list) | Haut-Katanga | CD-HK-LIK |
| Lisala | Confirmed (CENI 2023 list) | Mongala | CD-MO-LIS |
| Lubumbashi | Confirmed (CENI 2023 list) | Haut-Katanga | CD-HK-LUB |
| Lusambo | Confirmed (CENI 2023 list) | Sankuru | CD-SA-LUS |
| Matadi | Confirmed (CENI 2023 list) | Kongo Central | CD-BC-MAT |
| Mbandaka | Confirmed (CENI 2023 list) | Équateur | CD-EQ-MBA |
| Mbuji-Mayi | Confirmed (CENI 2023 list) | Kasaï Oriental | CD-KE-MBM |
| Muanda | Decree 2013 only, not in CENI 2023 list: UNVERIFIED current status | Kongo Central | CD-BC-MUA |
| Mwene-Ditu | Confirmed (CENI 2023 list) | Lomami | CD-LO-MWD |
| Zongo | Confirmed (CENI 2023 list) | Sud-Ubangi | CD-SU-ZON |

### 4.2 Missing from the owner list: 5 cities (added and flagged)

| City | Province | Why it matters |
|---|---|---|
| Boende | Tshuapa | Provincial capital (chef-lieu under Loi organique 15/006) and in the CENI 2023 list |
| Bunia | Ituri | Provincial capital and in the CENI 2023 list |
| Buta | Bas-Uélé | Provincial capital and in the CENI 2023 list |
| Tshikapa | Kasaï | Provincial capital and in the CENI 2023 list |
| Lumumbaville | Sankuru | In the CENI 2023 list; former Wembo-Nyama (Décret 13/023); not a provincial capital |

Under the organic law "all provincial capitals are cities" (Loi organique 08/016, as quoted by EN Wikipedia, S08). Without Boende, Bunia, Buta and Tshikapa, four provinces (Tshuapa, Ituri, Bas-Uélé, Kasaï) would have no city at all, so a warehouse-by-area scheme would have no urban anchor for them. They were therefore added to the JSON, each with `inOwnerList: false`, and can be filtered out in one line if you disagree.

### 4.3 In the owner list but not in the CENI 2023 list: 4 cities (kept and flagged)

Baraka (Sud-Kivu), Bumba (Mongala), Kongolo (Tanganyika), Muanda (Kongo Central).

What was verified in the primary text (Journal Officiel special issue of 20 June 2013, S10): article 1 of Décret 13/020 confers ville status on Kongolo, of 13/024 on Bumba, of 13/026 on Muanda, of 13/029 on Baraka (and Uvira, Kamituga, Shabunda). What the secondary sources add: FR Wikipedia (S09) says the Council of Ministers suspended those decrees in July 2015, leaving 33 villes, and that Baraka became the 34th ville in May 2018 and Uvira the 35th in December 2018. EN Wikipedia (S08) says the 2013 grant was upheld in mid-2018, with a staged roll-out, and lists Baraka and Uvira among settlements that have had a first mayor appointed.

What was NOT found: any source stating that Bumba, Kongolo or Muanda are operational villes today (with a mayor and electoral status). They are not in the CENI 2023 list. They are marked `decree-2013` with that caveat in each `note`. Treat them as "legally conferred in 2013, current functioning unverified". Practically, Bumba (Mongala), Kongolo (Tanganyika) and Muanda (Kongo Central) are real, sizeable towns, so keeping them as delivery anchors is reasonable, but do not describe them as "officially recognised villes" without checking.

### 4.4 Same status as Baraka, not in the dataset

Uvira (FR Wikipedia: 35th ville, December 2018) and the other settlements EN Wikipedia lists as "becoming cities" (Kamituga, Kasaji, Kasumbalesa, Oicha, Tshimbulu), plus the other places that received ville status in 2013 (about 98 in total at the time per FR Wikipedia). They were NOT added because they are not in your list and are not in the CENI 2023 list. Uvira (Sud-Kivu) is the obvious candidate if you keep Baraka; say so and it is a one-line addition.

### 4.5 Counting: "33" does not mean the same thing in every source

- CENI 2023 list (S07): 33 villes, Kinshasa NOT included (34 entries with Kinshasa). This is the set used here. It matches EN Wikipedia "33 cities plus Kinshasa" (S08).
- FR Wikipedia (S09): "33 villes" after the July 2015 suspension, counting Kinshasa; 35 in 2019 after Baraka and Uvira. That 33 did not yet contain Lumumbaville.
- Owner list: 33 names including Kinshasa, but with 5 provincial villes missing and 4 decree-only villes present.

### 4.6 Spelling

Mbuji-Mayi (Loi organique 15/006; CENI writes "Mbuji Mayi"; FR Wikipedia "Mbujimayi"), Mwene-Ditu (CENI "Mwene Ditu"), Muanda (the 2013 decree writes "Muanda"; the CENI file and EN Wikipedia write "Moanda"), Lumumbaville (CENI "Lumumba Ville"; formerly Wembo-Nyama). Variants are kept in `aliases` for matching. Province assignment: no source disagrees on the province of any city. The CENI file does not state provinces per ville; the provinces come from EN Wikipedia (S08) and agree with geography. Zongo is in Sud-Ubangi (EN Wikipedia), opposite Bangui.

## 5. Kinshasa: districts and communes

### 5.1 District membership (verified by several sources)

| District | Internal code | Communes | # | Area km2 (sum) | Population 2004 (sum) |
|---|---|---|---|---|---|
| Funa | CD-KN-D-FUN | Bandalungwa, Bumbu, Kalamu, Kasa-Vubu, Makala, Ngiri-Ngiri, Selembao | 7 | 55.99 | 1,768,505 |
| Lukunga | CD-KN-D-LUK | Barumbu, Gombe, Kinshasa, Kintambo, Lingwala, Mont-Ngafula, Ngaliema | 7 | 625.74 | 1,493,095 |
| Mont-Amba | CD-KN-D-MAM | Kisenso, Lemba, Limete, Matete, Ngaba | 5 | 116.78 | 1,561,146 |
| Tshangu | CD-KN-D-TSH | Kimbanseke, Maluku, Masina, N'djili, Nsele | 5 | 9,166.7 | 2,194,254 |

The four districts and their 7/7/5/5 split agree across EN Wikipedia "Communes of Kinshasa" (S12) and "Districts of the DRC" (S16), citypopulation.de using INS data (S14), the OpenStreetMap wiki (S15), the FR Wikipedia Lukunga page (S18) and the historical Ordonnance 77-100 of 1977 (S20, seen only through a search summary). The 24 commune names match the CENI 2023 file (S07).

**One conflict, Mont-Ngafula.** The FR Wikipedia articles "Kinshasa" and "Mont-Ngafula" (S17, S19) contradict themselves: their prose says Mont-Amba, while their district lists and navigation boxes put it in Lukunga (and list only Kisenso, Lemba, Limete, Matete, Ngaba under Mont-Amba). Every other source, including the 1977 ordinance, puts Mont-Ngafula in **Lukunga**; that is what the dataset uses. Also note (S16): the Kinshasa "districts" are administrative groupings used for police, water, schools and similar services, not decentralised entities; the 24 communes are the real units.

### 5.2 The 24 communes

Names: official spelling per CENI 2023 and the owner's list, with accents/hyphens as given (Mont-Ngafula, N'djili, Ngiri-Ngiri, Kasa-Vubu). Variants (Ndjili, N'Djili, Mont Ngafula, Kasavubu) are stored in `aliases`. Area and population: INS figures as shown on FR Wikipedia (S13), cross-checked with EN Wikipedia (areas) and citypopulation.de (populations). **Population is the INS estimate for 1 July 2004: about 20 years old and far below today's figures (FR Wikipedia quotes roughly 17 million for the whole city in 2025), so use it only as a relative weight between communes.** Sum of the 24 communes: 7,017,000 inhabitants, 9,965.21 km2.

| District | Commune | Internal code | Lat | Lng | Area km2 | Population (INS est. 2004) | Coord. method |
|---|---|---|---|---|---|---|---|
| Funa | Bandalungwa | CD-KN-BDL | -4.3422 | 15.2832 | 6.82 | 202,341 | OSM boundary centre |
| Funa | Bumbu | CD-KN-BMB | -4.3726 | 15.2934 | 5.30 | 329,234 | OSM boundary centre |
| Funa | Kalamu | CD-KN-KLM | -4.3496 | 15.3179 | 6.64 | 315,342 | OSM boundary centre |
| Funa | Kasa-Vubu | CD-KN-KSV | -4.3417 | 15.3040 | 5.05 | 157,320 | OSM boundary centre |
| Funa | Makala | CD-KN-MKL | -4.3830 | 15.3085 | 5.60 | 253,844 | OSM boundary centre |
| Funa | Ngiri-Ngiri | CD-KN-NGN | -4.3569 | 15.2987 | 3.40 | 174,843 | OSM boundary centre |
| Funa | Selembao | CD-KN-SLM | -4.4010 | 15.2852 | 23.18 | 335,581 | OSM boundary centre |
| Lukunga | Barumbu | CD-KN-BRM | -4.3190 | 15.3257 | 4.72 | 150,319 | OSM boundary centre |
| Lukunga | Gombe | CD-KN-GOM | -4.3031 | 15.3033 | 29.33 | 32,373 | Wikipedia point (built-up area) |
| Lukunga | Kinshasa | CD-KN-KNS | -4.3219 | 15.3118 | 2.87 | 164,857 | OSM boundary centre |
| Lukunga | Kintambo | CD-KN-KTB | -4.3434 | 15.2667 | 2.72 | 106,772 | OSM boundary centre |
| Lukunga | Lingwala | CD-KN-LNG | -4.3253 | 15.3013 | 2.88 | 94,635 | OSM boundary centre |
| Lukunga | Mont-Ngafula | CD-KN-MNG | -4.4247 | 15.2956 | 358.92 | 261,004 | Wikipedia point (built-up area) |
| Lukunga | Ngaliema | CD-KN-NGL | -4.3755 | 15.2474 | 224.30 | 683,135 | OSM boundary centre |
| Mont-Amba | Kisenso | CD-KN-KSN | -4.4177 | 15.3417 | 16.60 | 386,151 | OSM boundary centre |
| Mont-Amba | Lemba | CD-KN-LMB | -4.4040 | 15.3173 | 23.70 | 349,838 | OSM boundary centre |
| Mont-Amba | Limete | CD-KN-LMT | -4.3543 | 15.3467 | 67.60 | 375,726 | OSM boundary centre |
| Mont-Amba | Matete | CD-KN-MTT | -4.3890 | 15.3513 | 4.88 | 268,781 | OSM boundary centre |
| Mont-Amba | Ngaba | CD-KN-NGB | -4.3813 | 15.3218 | 4.00 | 180,650 | OSM boundary centre |
| Tshangu | Kimbanseke | CD-KN-KMB | -4.4417 | 15.4035 | 237.78 | 946,372 | OSM boundary centre |
| Tshangu | Maluku | CD-KN-MLK | -4.4614 | 16.0786 | 7,948.80 | 179,648 | Wikipedia point (built-up area) |
| Tshangu | Masina | CD-KN-MSN | -4.3662 | 15.3910 | 69.93 | 485,167 | OSM boundary centre |
| Tshangu | N'djili | CD-KN-NDJ | -4.4070 | 15.3755 | 11.40 | 442,138 | OSM boundary centre |
| Tshangu | Nsele | CD-KN-NSL | -4.3744 | 15.4947 | 898.79 | 140,929 | Wikipedia point (built-up area) |

Coordinate method: lat/lng is "a point at the heart of the commune's built-up area", accurate to roughly 1-3 km, NOT a geometric centroid. For 20 communes it is the centre point OpenStreetMap assigns to the commune boundary (S22; (c) OpenStreetMap contributors, ODbL). Cross-check against the Wikipedia article coordinates (S21): 18 of the 20 agree within 1 km, and the two large or elongated communes (Selembao, Ngaliema) differ by about 3 km. For four communes the OSM boundary centre is not in the settled area, so the Wikipedia point is used instead: Gombe (the boundary includes river area; the OSM centre is about 2 km from the built-up area), Mont-Ngafula (very large and mostly rural, 359 km2), Maluku (7,949 km2, mostly rural; the point is Maluku town) and Nsele (899 km2; the point is Nsele). For Maluku, Nsele and Mont-Ngafula a delivery system should treat the point as the main settlement, not the middle of the commune.

## 6. Quartiers: none imported

Policy applied: import quartiers only from a reliable, complete source; otherwise leave empty. **No such source was found for any of the 24 communes**, so all `quartiers` arrays are empty.

Why:

1. No official list turned up in searches (INS, ONU-Habitat, HDX, CENI, provincial government); the CENI 2023 file stops at commune level.
2. The total is not even agreed: FR Wikipedia says 314 quartiers (S13), a thesis says 326, and the per-commune counts printed on the same FR Wikipedia "Kinshasa" article add up to 329 (or 334 if Mont-Ngafula uses the 21 listed on its own article), not 314.
3. The same source contradicts itself for Mont-Ngafula (16 vs 21) and for the area of Ngaliema (224.3 km2 vs 62.64 km2).
4. Where a list exists it comes from a single student thesis or an unverifiable commune report, and the spellings differ between sources (Limete).
5. Most FR Wikipedia commune pages (Gombe, Barumbu, Lingwala, Kintambo) contain no list at all.

What was found, per commune (for follow-up only; none of it is in the JSON). The counts in the second column are as printed on FR Wikipedia and are unverified; Mont-Amba counts come from table columns whose headers were not visible, so they are an inference.

| Commune | Count printed on FR Wikipedia "Kinshasa" (unverified) | Other evidence found | Imported? |
|---|---|---|---|
| Bandalungwa | 7 | None found. | No (empty) |
| Bumbu | 13 | None found. | No (empty) |
| Kalamu | 18 | None found. | No (empty) |
| Kasa-Vubu | 7 | None found. | No (empty) |
| Makala | 14 | None found. | No (empty) |
| Ngiri-Ngiri | 8 | None found. | No (empty) |
| Selembao | 18 | None found. | No (empty) |
| Barumbu | 9 | None found. | No (empty) |
| Gombe | 10 | 10 quartiers named in a 2011 student thesis (memoireonline.com): Batetela, Cliniques, Commerce, Croix-Rouge, Fleuve, Gare, Golf, Haut-Commandement, Lemera, Révolution. The FR Wikipedia commune page has no list. | No (empty) |
| Kinshasa | 7 | EN Wikipedia lists 7 (Madimba, Ngabka, Mongala, Aketi, Djalo, Pende, Boyoma) citing a 2020 ISAU student thesis; "Ngabka" looks like a typo. | No (empty) |
| Kintambo | 8 | None found. | No (empty) |
| Lingwala | 9 | None found. | No (empty) |
| Mont-Ngafula | 16 | FR Wikipedia commune page lists 21, but the FR Wikipedia "Kinshasa" table says 16: the same source contradicts itself. | No (empty) |
| Ngaliema | 21 | FR Wikipedia lists 21 citing "Rapport de la commune de Ngaliema 2009" (not independently verified; the same page also gives a conflicting area, 62.64 km2). | No (empty) |
| Kisenso | 17 | None found. | No (empty) |
| Lemba | 15 | None found. | No (empty) |
| Limete | 14 | Two student theses each list 14 quartiers but disagree on names (e.g. Moteba vs Mateba; one has Funa, the other Mfumu Mvula). | No (empty) |
| Matete | 13 | None found. | No (empty) |
| Ngaba | 6 | None found. | No (empty) |
| Kimbanseke | 30 | None found. | No (empty) |
| Maluku | 19 | None found. | No (empty) |
| Masina | 21 | None found. | No (empty) |
| N'djili | 13 | None found. | No (empty) |
| Nsele | 16 | None found. | No (empty) |

Recommended next step if quartier-level routing is needed: obtain the list from the Kinshasa provincial government / Hôtel de Ville (division urbaine de l'intérieur) or the INS, or ask each commune office, rather than scraping Wikipedia.

## 7. Codes

- **Provinces: official.** ISO 3166-2:CD, e.g. `CD-KN` Kinshasa, `CD-NK` Nord-Kivu. All 26 verified against two sources (S01, S02). Note `CD-MN` is Mai-Ndombe and `CD-MA` is Maniema (easy to swap). Codes `CD-BN`, `CD-KA`, `CD-KW`, `CD-OR` belong to the pre-2016 provinces and are retired; `CD-BC` now stands for Kongo Central and `CD-KE` for Kasaï Oriental.
- **Cities: INTERNAL, not official.** Pattern `CD-<province suffix>-<3 letters>`, e.g. `CD-KN-KIN` Kinshasa, `CD-NK-GOM` Goma, `CD-NK-BTM` Butembo (Buta is `CD-BU-BUT`). Unique across the dataset because the province prefix is part of the code.
- **Kinshasa districts: INTERNAL.** `CD-KN-D-FUN`, `CD-KN-D-LUK`, `CD-KN-D-MAM`, `CD-KN-D-TSH`.
- **Communes: INTERNAL.** `CD-KN-<3 letters>`, e.g. `CD-KN-GOM` Gombe. The commune named Kinshasa is `CD-KN-KNS` so it cannot be confused with the city `CD-KN-KIN`.
- No official commune or ville code system was found (searched for INS/national codes; none surfaced). The UN OCHA / SALB common-operational-dataset P-codes may exist but could not be retrieved, so they are not used or cited. If an official system is found later, replace these codes (they are kept in one place: the `code` fields).

Quartier codes are undefined for now because there are no quartiers.

## 8. Uncertain or conflicting items

1. **Status of Bumba, Kongolo, Muanda, Baraka** as current villes (section 4.3). Conferred 2013, suspended 2015, upheld 2018, operational status not confirmed (Baraka is the best documented).
2. **Cities added to your list** (Boende, Bunia, Buta, Tshikapa, Lumumbaville) are a judgement call; the evidence (primary law plus CENI list) is strong, but the decision to include them is yours.
3. **Mont-Ngafula district**: Lukunga (majority of sources and the 1977 ordinance) vs Mont-Amba (prose in two FR Wikipedia articles). Dataset: Lukunga.
4. **Ordonnance 77-100 (1977)** and a 2010 notarial-offices arrêté that reproduces the district grouping were read only through search-result summaries, because leganet.cd served an invalid TLS certificate and could not be fetched. Treated as supporting evidence, not as the main proof.
5. **Province names**: spelling differs between ISO (Bas-Uélé, Haut-Uélé, Équateur, Kasaï Central, Kasaï Oriental, Kongo Central), the organic law text (Bas-Uele, Haut-Uele, Equateur, same hyphen style) and FR Wikipedia (Kasaï-Central, Kasaï-Oriental, Kongo-Central). ISO spelling is used. English names are ISO's non-normative column ("Equator", "Central Kongo" are literal; common usage keeps the French form).
6. **Capitals of Kasaï and Kwilu**: Statoids (S06) gives Luebo and Kikwit (outdated planning values); Loi organique 15/006, EN and FR Wikipedia give Tshikapa and Bandundu. The law was used.
7. **Commune populations** are 2004 INS estimates. EN Wikipedia's "2015 estimates" were rejected: they give identical values for Ndjili and Kisenso (1,157,619), sum to about 21 million against a stated city total of 12 million, and show an inconsistent density for Ndjili. FR Wikipedia's Gombe commune page prints 92,373 but its list page and citypopulation.de both give 32,373 (the latter is used).
8. **Ngaliema area**: 224.3 km2 (S12, S13) vs 62.64 km2 on its own FR Wikipedia page; 224.3 is used (two sources agree). The commune is large, so the smaller figure looks wrong, but this is not independently proven.
9. **Coordinates** are approximate (section 5.2 and section 3); city points for Beni, Butembo, Buta, Bunia, Mwene-Ditu, Inongo, Kolwezi, Kindu, Gemena, Gbadolite, Isiro, Kisangani, Tshikapa, Boma, Matadi, Likasi, Kongolo and Kamina come from Wikipedia values rounded to the arc-minute or better. City coordinates rest on one source family (Wikipedia article coordinates) and were only sanity-checked by hand against known geography, not against a second dataset.
10. **Quartier counts and lists**: see section 6. Nothing imported.
11. **Extraction method**: pages were read through a fetch tool that summarises with a language model; any figure that matters (codes, capitals, populations, areas, district lists) was confirmed against a second source or the primary text, and the three legal or official PDFs (CENI file, Journal Officiel of 20 June 2013, Loi organique 15/006) were read as extracted text.

## 9. Sources

By part:

- Provinces (codes, names, capitals): S01, S02, S03, S04, S05, S06
- Cities (list, province, status): S07, S08, S09, S10, S11, S03
- Kinshasa districts and communes: S07, S12, S13, S14, S15, S16, S17, S18, S19, S20
- Coordinates: S21 (Wikipedia), S22 (OpenStreetMap)
- Quartiers examined: S13, S17, S19, S23

Full list (also in the JSON `sources` array):

- **S01** ISO 3166-2:CD (Wikipedia, mirrors the ISO standard and its change history): <https://en.wikipedia.org/wiki/ISO_3166-2:CD>. Used for: Province ISO 3166-2 codes, ISO French names, English reference names.
- **S02** Debian iso-codes, data/iso_3166-2.json (open-source package that tracks the ISO 3166-2 standard): <https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/main/data/iso_3166-2.json>. Used for: Independent confirmation of the 26 CD-xx codes and French names (Kinshasa typed City, the other 25 Province).
- **S03** Loi organique n° 15/006 du 25 mars 2015 portant fixation des limites des provinces et celles de la ville de Kinshasa: <https://www.droitcongolais.info/files/128.03.15-Loi-du-25-mars-2015_Limites-de-province.pdf>. Used for: Official names of the 25 provinces (art. 2) and their chefs-lieux (provincial capitals).
- **S04** Provinces of the Democratic Republic of the Congo (Wikipedia EN): <https://en.wikipedia.org/wiki/Provinces_of_the_Democratic_Republic_of_the_Congo>. Used for: Cross-check of codes and capitals; former province of each new province.
- **S05** Provinces de la république démocratique du Congo (Wikipédia FR): <https://fr.wikipedia.org/wiki/Provinces_de_la_r%C3%A9publique_d%C3%A9mocratique_du_Congo>. Used for: Cross-check of chefs-lieux.
- **S06** Statoids - Provinces of DR Congo: <https://statoids.com/ucd.html>. Used for: Cross-check only; its capitals for Kasaï (Luebo) and Kwilu (Kikwit) are outdated planning values and were NOT used.
- **S07** CENI - Villes et communes de la RDC telles que reprises dans la loi portant répartition des sièges 2023: <https://www.ceni.cd/sites/default/files/2023-08/Listes%20des%20Villes%20et%20Communes_D%C3%A9put%C3%A9_Provincial_Conseiller_Communal.pdf>. Used for: Official list of the 33 villes (excl. Kinshasa) and the 24 communes of Kinshasa.
- **S08** Cities of the Democratic Republic of the Congo (Wikipedia EN): <https://en.wikipedia.org/wiki/Cities_of_the_Democratic_Republic_of_the_Congo>. Used for: Province of each of the 33 villes; legal framework; list of settlements becoming cities (Baraka, Uvira, Kamituga, Kasaji, Kasumbalesa, Oicha, Tshimbulu).
- **S09** Liste des villes de la république démocratique du Congo (Wikipédia FR): <https://fr.wikipedia.org/wiki/Liste_des_villes_de_la_r%C3%A9publique_d%C3%A9mocratique_du_Congo>. Used for: History of ville status (2013 decrees, 2015 suspension leaving 33, Baraka 34th in 2018, Uvira 35th); 35-ville list of 2019.
- **S10** Journal Officiel de la RDC, numéro spécial du 20 juin 2013 (Décrets n° 13/020 à 13/030 du 13 juin 2013): <https://droitcongolais.info/files/Decrets-13-juin-2013.pdf>. Used for: Primary text confirming ville status of Kongolo, Bumba, Muanda, Baraka, Uvira, Boende, Lumumbaville (Wembo-Nyama).
- **S11** Lumumbaville (Wikipedia EN): <https://en.wikipedia.org/wiki/Lumumbaville>. Used for: Lumumbaville = former Wembo-Nyama, Sankuru, status history, coordinates.
- **S12** Communes of Kinshasa (Wikipedia EN): <https://en.wikipedia.org/wiki/Communes_of_Kinshasa>. Used for: District membership of the 24 communes; areas (cross-check).
- **S13** Liste des communes de Kinshasa (Wikipédia FR): <https://fr.wikipedia.org/wiki/Liste_des_communes_de_Kinshasa>. Used for: Commune areas (km2) and INS 2004 populations; "24 communes et 314 quartiers".
- **S14** citypopulation.de - Kinshasa districts and communes (INS data): <https://citypopulation.de/en/drcongo/kinshasa/admin/>. Used for: District membership; 1984 census and 2004 estimates (cross-check of populations).
- **S15** OpenStreetMap Wiki - Kinshasa: <https://wiki.openstreetmap.org/wiki/Kinshasa>. Used for: District membership of the 24 communes; OSM relation ids.
- **S16** Districts of the Democratic Republic of the Congo (Wikipedia EN): <https://en.wikipedia.org/wiki/Districts_of_the_Democratic_Republic_of_the_Congo>. Used for: District membership; note that Kinshasa districts are not decentralised-entity subdivisions.
- **S17** Kinshasa (Wikipédia FR): <https://fr.wikipedia.org/wiki/Kinshasa>. Used for: Districts; per-commune quartier counts (unreliable, internally inconsistent).
- **S18** Lukunga (district) (Wikipédia FR): <https://fr.wikipedia.org/wiki/Lukunga_(district)>. Used for: Mont-Ngafula placed in Lukunga.
- **S19** Mont-Ngafula (Wikipédia FR): <https://fr.wikipedia.org/wiki/Mont-Ngafula>. Used for: Self-inconsistent on district (text says Mont-Amba, navigation says Lukunga); 21 quartiers listed (conflicts with 16 on S17).
- **S20** Ordonnance n° 77-100 du 6 avril 1977 fixant les limites de la ville de Kinshasa, ses sous-régions et zones (Leganet): <https://www.leganet.cd/Legislation/Droit%20Public/Administration.ter/o.77.100.06.04.1977.html>. Used for: Historical legal basis of the four sub-regions (Lukunga incl. Mont Ngafula). NOTE: the page could not be fetched directly (TLS certificate error); its content was seen only through a search-result summary.
- **S21** Wikipedia (EN/FR) article coordinates via the MediaWiki API (prop=coordinates): <https://en.wikipedia.org/w/api.php?action=query&prop=coordinates>. Used for: City-centre coordinates; commune coordinates for Gombe, Mont-Ngafula, Maluku, Nsele. Text licence CC BY-SA.
- **S22** OpenStreetMap Nominatim - administrative boundary centre points of the Kinshasa communes: <https://nominatim.openstreetmap.org/>. Used for: Commune coordinates for the 20 communes marked coordSource=osm. Data (c) OpenStreetMap contributors, ODbL 1.0.
- **S23** Quartier candidates examined (NOT imported): Ngaliema (FR Wikipedia), Kinshasa commune (EN Wikipedia), Gombe and Limete (student theses on memoireonline.com): <https://fr.wikipedia.org/wiki/Ngaliema>. Used for: Evidence for the decision not to import any quartier list; see docs/DRC-GEOGRAPHY.md section 6.

Additional URLs behind S23: Ngaliema <https://fr.wikipedia.org/wiki/Ngaliema>; Kinshasa (commune) <https://en.wikipedia.org/wiki/Kinshasa_(commune)>; Gombe thesis <https://www.memoireonline.com/02/17/9607/m_Amelioration-de-la-mobilite--l-hyper-centre-de-Kinshasa-et-strategies-de-reduction-de-la-forte7.html>; Limete theses <https://www.memoireonline.com/11/15/9287/m_Niveau-de-connaissance-des-habitants-de-la-commune-de-Limete-face--la-gestion-de-leur-environnemen8.html> (these two were read only as search-result excerpts).
