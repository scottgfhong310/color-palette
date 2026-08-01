/* ENMY colour data — build artefact, do not hand-edit.
 * Exported from the family colour database (db_artcolor), the System of Record.
 * Upstream provenance: enmy.com (the brand’s own Shopify store), frozen.
 *   products.json          80 variants = the official code list (machine-readable).
 *   80-colour chart image  hex for all 80.
 *   60-set chart image     hex for 60 of them; identical to the above, dE00 = 0.00.
 * THE BRAND PUBLISHES NO COLOUR NAMES. Colours are identified by code alone.
 *   nameZh exists for 4 skin tones only, printed on the colour card that ships in the box
 *   (photographed by a retailer). There is no English or Japanese name for any colour,
 *   so unlike the other registries in this family there is no official name to show.
 * `prefix` is the letter part of the code (R1 -> R). It is the structure of the code,
 *   NOT a named family: the brand has never published names for the 14 prefixes.
 *   `family` is the brand’s own 8-way grouping from the store, which does have
 *   official English names.
 * `verify` is per-colour: "cross-validated" = the value agrees byte-for-byte between the
 *   two official charts; "approximate" = only one chart carries it.
 * No lightfastness and no pigment fields: water-based acrylic, the brand publishes neither.
 * Fields: code, prefix, nameZh?, hex, r/g/b, cssVar, family, verify.
 */
window.ENMY_META = {"brand":"ENMY","brandZh":"恩米","total":80,"families":8,"line":"Direct Liquid Acrylic Paint Marker","crossValidated":60,"named":4,"note":"Hex read from the flat digital fills of the two official colour charts published on the brand’s own store. The 60 colours that appear on both charts are byte-identical between them; the other 20 have a single source. These are marketing assets, not a colour specification: the brand makes no claim that they match the ink."};
window.ENMY_FAMILIES = [{"code":"black-white","name":"Black & White","chromatic":false},{"code":"red-pink","name":"Red & Pink","chromatic":true},{"code":"orange-yellow","name":"Orange & Yellow","chromatic":true},{"code":"green","name":"Green","chromatic":true},{"code":"blue-teal","name":"Blue & Teal","chromatic":true},{"code":"purple-violet","name":"Purple & Violet","chromatic":true},{"code":"brown-earth","name":"Brown & Earth Tones","chromatic":true},{"code":"gray-neutral","name":"Gray & Neutral","chromatic":false}];
window.ENMY_COLORS = [
  {"code":"0","hex":"#000000","r":0,"g":0,"b":0,"cssVar":"--enmy-0","family":"black-white","verify":"cross-validated"},
  {"code":"1","hex":"#ffffff","r":255,"g":255,"b":255,"cssVar":"--enmy-1","family":"black-white","verify":"cross-validated"},
  {"code":"R1","prefix":"R","hex":"#d6473f","r":214,"g":71,"b":63,"cssVar":"--enmy-r1","family":"red-pink","verify":"cross-validated"},
  {"code":"R2","prefix":"R","hex":"#f9d5d9","r":249,"g":213,"b":217,"cssVar":"--enmy-r2","family":"red-pink","verify":"cross-validated"},
  {"code":"R3","prefix":"R","hex":"#b93133","r":185,"g":49,"b":51,"cssVar":"--enmy-r3","family":"red-pink","verify":"cross-validated"},
  {"code":"R4","prefix":"R","hex":"#ef897b","r":239,"g":137,"b":123,"cssVar":"--enmy-r4","family":"red-pink","verify":"cross-validated"},
  {"code":"R5","prefix":"R","hex":"#f4aeb8","r":244,"g":174,"b":184,"cssVar":"--enmy-r5","family":"red-pink","verify":"cross-validated"},
  {"code":"R6","prefix":"R","hex":"#921d2d","r":146,"g":29,"b":45,"cssVar":"--enmy-r6","family":"red-pink","verify":"approximate"},
  {"code":"R7","prefix":"R","hex":"#ca6c6c","r":202,"g":108,"b":108,"cssVar":"--enmy-r7","family":"red-pink","verify":"approximate"},
  {"code":"VR1","prefix":"VR","hex":"#d64473","r":214,"g":68,"b":115,"cssVar":"--enmy-vr1","family":"red-pink","verify":"cross-validated"},
  {"code":"VR2","prefix":"VR","hex":"#efa4c5","r":239,"g":164,"b":197,"cssVar":"--enmy-vr2","family":"red-pink","verify":"cross-validated"},
  {"code":"VR3","prefix":"VR","hex":"#ea6ea0","r":234,"g":110,"b":160,"cssVar":"--enmy-vr3","family":"red-pink","verify":"cross-validated"},
  {"code":"VR4","prefix":"VR","hex":"#e0c4dd","r":224,"g":196,"b":221,"cssVar":"--enmy-vr4","family":"red-pink","verify":"cross-validated"},
  {"code":"VR5","prefix":"VR","hex":"#f0c3da","r":240,"g":195,"b":218,"cssVar":"--enmy-vr5","family":"red-pink","verify":"cross-validated"},
  {"code":"Y1","prefix":"Y","hex":"#f5d33c","r":245,"g":211,"b":60,"cssVar":"--enmy-y1","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y2","prefix":"Y","hex":"#f8f5b2","r":248,"g":245,"b":178,"cssVar":"--enmy-y2","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y3","prefix":"Y","hex":"#f5bc39","r":245,"g":188,"b":57,"cssVar":"--enmy-y3","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y4","prefix":"Y","hex":"#f6bf2e","r":246,"g":191,"b":46,"cssVar":"--enmy-y4","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y5","prefix":"Y","hex":"#f4ed61","r":244,"g":237,"b":97,"cssVar":"--enmy-y5","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y6","prefix":"Y","hex":"#f8d184","r":248,"g":209,"b":132,"cssVar":"--enmy-y6","family":"orange-yellow","verify":"cross-validated"},
  {"code":"Y7","prefix":"Y","hex":"#f4dc24","r":244,"g":220,"b":36,"cssVar":"--enmy-y7","family":"orange-yellow","verify":"approximate"},
  {"code":"RY1","prefix":"RY","hex":"#f08418","r":240,"g":132,"b":24,"cssVar":"--enmy-ry1","family":"orange-yellow","verify":"cross-validated"},
  {"code":"RY2","prefix":"RY","hex":"#f5a04f","r":245,"g":160,"b":79,"cssVar":"--enmy-ry2","family":"orange-yellow","verify":"cross-validated"},
  {"code":"RY3","prefix":"RY","hex":"#ee786c","r":238,"g":120,"b":108,"cssVar":"--enmy-ry3","family":"orange-yellow","verify":"cross-validated"},
  {"code":"RY4","prefix":"RY","hex":"#e36731","r":227,"g":103,"b":49,"cssVar":"--enmy-ry4","family":"orange-yellow","verify":"cross-validated"},
  {"code":"G1","prefix":"G","hex":"#1e8b3c","r":30,"g":139,"b":60,"cssVar":"--enmy-g1","family":"green","verify":"cross-validated"},
  {"code":"G2","prefix":"G","hex":"#48b76b","r":72,"g":183,"b":107,"cssVar":"--enmy-g2","family":"green","verify":"cross-validated"},
  {"code":"G3","prefix":"G","hex":"#e2e982","r":226,"g":233,"b":130,"cssVar":"--enmy-g3","family":"green","verify":"cross-validated"},
  {"code":"G4","prefix":"G","hex":"#a3d188","r":163,"g":209,"b":136,"cssVar":"--enmy-g4","family":"green","verify":"cross-validated"},
  {"code":"G5","prefix":"G","hex":"#acd04a","r":172,"g":208,"b":74,"cssVar":"--enmy-g5","family":"green","verify":"cross-validated"},
  {"code":"G6","prefix":"G","hex":"#75c183","r":117,"g":193,"b":131,"cssVar":"--enmy-g6","family":"green","verify":"cross-validated"},
  {"code":"G7","prefix":"G","hex":"#cae09f","r":202,"g":224,"b":159,"cssVar":"--enmy-g7","family":"green","verify":"cross-validated"},
  {"code":"G8","prefix":"G","hex":"#c1e0be","r":193,"g":224,"b":190,"cssVar":"--enmy-g8","family":"green","verify":"cross-validated"},
  {"code":"G9","prefix":"G","hex":"#557939","r":85,"g":121,"b":57,"cssVar":"--enmy-g9","family":"green","verify":"cross-validated"},
  {"code":"G10","prefix":"G","hex":"#90c320","r":144,"g":195,"b":32,"cssVar":"--enmy-g10","family":"green","verify":"approximate"},
  {"code":"G11","prefix":"G","hex":"#174238","r":23,"g":66,"b":56,"cssVar":"--enmy-g11","family":"green","verify":"approximate"},
  {"code":"G12","prefix":"G","hex":"#9ab371","r":154,"g":179,"b":113,"cssVar":"--enmy-g12","family":"green","verify":"approximate"},
  {"code":"G13","prefix":"G","hex":"#d5e7bd","r":213,"g":231,"b":189,"cssVar":"--enmy-g13","family":"green","verify":"approximate"},
  {"code":"B1","prefix":"B","hex":"#3d9ad5","r":61,"g":154,"b":213,"cssVar":"--enmy-b1","family":"blue-teal","verify":"cross-validated"},
  {"code":"B2","prefix":"B","hex":"#cfebf7","r":207,"g":235,"b":247,"cssVar":"--enmy-b2","family":"blue-teal","verify":"cross-validated"},
  {"code":"B3","prefix":"B","hex":"#2e62ad","r":46,"g":98,"b":173,"cssVar":"--enmy-b3","family":"blue-teal","verify":"cross-validated"},
  {"code":"B4","prefix":"B","hex":"#99cef0","r":153,"g":206,"b":240,"cssVar":"--enmy-b4","family":"blue-teal","verify":"cross-validated"},
  {"code":"B5","prefix":"B","hex":"#2d3d95","r":45,"g":61,"b":149,"cssVar":"--enmy-b5","family":"blue-teal","verify":"cross-validated"},
  {"code":"B6","prefix":"B","hex":"#72b9e7","r":114,"g":185,"b":231,"cssVar":"--enmy-b6","family":"blue-teal","verify":"cross-validated"},
  {"code":"B7","prefix":"B","hex":"#afd1ed","r":175,"g":209,"b":237,"cssVar":"--enmy-b7","family":"blue-teal","verify":"cross-validated"},
  {"code":"B8","prefix":"B","hex":"#293565","r":41,"g":53,"b":101,"cssVar":"--enmy-b8","family":"blue-teal","verify":"approximate"},
  {"code":"B9","prefix":"B","hex":"#dbe4eb","r":219,"g":228,"b":235,"cssVar":"--enmy-b9","family":"blue-teal","verify":"approximate"},
  {"code":"B10","prefix":"B","hex":"#85c3ec","r":133,"g":195,"b":236,"cssVar":"--enmy-b10","family":"blue-teal","verify":"approximate"},
  {"code":"B11","prefix":"B","hex":"#174ea1","r":23,"g":78,"b":161,"cssVar":"--enmy-b11","family":"blue-teal","verify":"approximate"},
  {"code":"B12","prefix":"B","hex":"#4362a3","r":67,"g":98,"b":163,"cssVar":"--enmy-b12","family":"blue-teal","verify":"approximate"},
  {"code":"BG1","prefix":"BG","hex":"#8bcdbf","r":139,"g":205,"b":191,"cssVar":"--enmy-bg1","family":"blue-teal","verify":"cross-validated"},
  {"code":"BG2","prefix":"BG","hex":"#d7ecdd","r":215,"g":236,"b":221,"cssVar":"--enmy-bg2","family":"blue-teal","verify":"cross-validated"},
  {"code":"BG3","prefix":"BG","hex":"#66c4ce","r":102,"g":196,"b":206,"cssVar":"--enmy-bg3","family":"blue-teal","verify":"cross-validated"},
  {"code":"BG4","prefix":"BG","hex":"#1e8687","r":30,"g":134,"b":135,"cssVar":"--enmy-bg4","family":"blue-teal","verify":"cross-validated"},
  {"code":"BG5","prefix":"BG","hex":"#88ccc1","r":136,"g":204,"b":193,"cssVar":"--enmy-bg5","family":"blue-teal","verify":"approximate"},
  {"code":"BG6","prefix":"BG","hex":"#70afa4","r":112,"g":175,"b":164,"cssVar":"--enmy-bg6","family":"blue-teal","verify":"approximate"},
  {"code":"V1","prefix":"V","hex":"#8e6eaf","r":142,"g":110,"b":175,"cssVar":"--enmy-v1","family":"purple-violet","verify":"cross-validated"},
  {"code":"V2","prefix":"V","hex":"#bea9d2","r":190,"g":169,"b":210,"cssVar":"--enmy-v2","family":"purple-violet","verify":"cross-validated"},
  {"code":"V3","prefix":"V","hex":"#7766ac","r":119,"g":102,"b":172,"cssVar":"--enmy-v3","family":"purple-violet","verify":"cross-validated"},
  {"code":"V4","prefix":"V","hex":"#5d54a3","r":93,"g":84,"b":163,"cssVar":"--enmy-v4","family":"purple-violet","verify":"cross-validated"},
  {"code":"V5","prefix":"V","hex":"#b094c4","r":176,"g":148,"b":196,"cssVar":"--enmy-v5","family":"purple-violet","verify":"approximate"},
  {"code":"V6","prefix":"V","hex":"#4a3590","r":74,"g":53,"b":144,"cssVar":"--enmy-v6","family":"purple-violet","verify":"approximate"},
  {"code":"V7","prefix":"V","hex":"#674e9f","r":103,"g":78,"b":159,"cssVar":"--enmy-v7","family":"purple-violet","verify":"approximate"},
  {"code":"BV1","prefix":"BV","hex":"#c5c2e1","r":197,"g":194,"b":225,"cssVar":"--enmy-bv1","family":"purple-violet","verify":"cross-validated"},
  {"code":"BV2","prefix":"BV","hex":"#959bcd","r":149,"g":155,"b":205,"cssVar":"--enmy-bv2","family":"purple-violet","verify":"cross-validated"},
  {"code":"BR1","prefix":"BR","hex":"#8b6854","r":139,"g":104,"b":84,"cssVar":"--enmy-br1","family":"brown-earth","verify":"cross-validated"},
  {"code":"BR2","prefix":"BR","hex":"#ce9f71","r":206,"g":159,"b":113,"cssVar":"--enmy-br2","family":"brown-earth","verify":"cross-validated"},
  {"code":"BR3","prefix":"BR","hex":"#e9c7a4","r":233,"g":199,"b":164,"cssVar":"--enmy-br3","family":"brown-earth","verify":"cross-validated"},
  {"code":"BR4","prefix":"BR","hex":"#b27d5e","r":178,"g":125,"b":94,"cssVar":"--enmy-br4","family":"brown-earth","verify":"cross-validated"},
  {"code":"BR5","prefix":"BR","hex":"#ac876a","r":172,"g":135,"b":106,"cssVar":"--enmy-br5","family":"brown-earth","verify":"cross-validated"},
  {"code":"BR6","prefix":"BR","hex":"#f5dfc8","r":245,"g":223,"b":200,"cssVar":"--enmy-br6","family":"brown-earth","verify":"approximate"},
  {"code":"BR7","prefix":"BR","hex":"#e3dac9","r":227,"g":218,"b":201,"cssVar":"--enmy-br7","family":"brown-earth","verify":"approximate"},
  {"code":"E1","prefix":"E","nameZh":"淺膚2","hex":"#fef4eb","r":254,"g":244,"b":235,"cssVar":"--enmy-e1","family":"brown-earth","verify":"cross-validated"},
  {"code":"E2","prefix":"E","nameZh":"膚3","hex":"#fde8d7","r":253,"g":232,"b":215,"cssVar":"--enmy-e2","family":"brown-earth","verify":"cross-validated"},
  {"code":"E3","prefix":"E","nameZh":"膚4","hex":"#fef4d0","r":254,"g":244,"b":208,"cssVar":"--enmy-e3","family":"brown-earth","verify":"cross-validated"},
  {"code":"E4","prefix":"E","hex":"#fefaf7","r":254,"g":250,"b":247,"cssVar":"--enmy-e4","family":"brown-earth","verify":"approximate"},
  {"code":"DE1","prefix":"DE","hex":"#f2c6bb","r":242,"g":198,"b":187,"cssVar":"--enmy-de1","family":"brown-earth","verify":"cross-validated"},
  {"code":"DE2","prefix":"DE","nameZh":"深膚2","hex":"#f9d2b1","r":249,"g":210,"b":177,"cssVar":"--enmy-de2","family":"brown-earth","verify":"cross-validated"},
  {"code":"GY1","prefix":"GY","hex":"#b8bcc5","r":184,"g":188,"b":197,"cssVar":"--enmy-gy1","family":"gray-neutral","verify":"cross-validated"},
  {"code":"GY2","prefix":"GY","hex":"#4d5152","r":77,"g":81,"b":82,"cssVar":"--enmy-gy2","family":"gray-neutral","verify":"cross-validated"}
];
