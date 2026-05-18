/**
 * Guarda descripciones directamente en Firestore campo `descripcion`
 * para que aparezcan en la interfaz de informacion de cada lugar.
 * Uso: cd ~/Pitzbol-Backend && cp scripts/set-descripciones.js /tmp/ && node /tmp/set-descripciones.js
 */
require('dotenv').config();
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
}) });
const db = admin.firestore();

const DESCRIPCIONES = {
  // ── Cultura e Historia ────────────────────────────────────────────────────────
  "Instituto Cultural Cabañas, Guadalajara": "Patrimonio de la Humanidad por la UNESCO. Fundado en 1810, alberga los murales de José Clemente Orozco con el icónico Hombre de Fuego en su cúpula central.",
  "Teatro Degollado, Guadalajara": "El principal recinto escénico de Guadalajara inaugurado en 1866. Sede de la Orquesta Filarmónica y el Ballet Folklórico de la UdeG; fachada neoclásica declarada Patrimonio Cultural.",
  "Catedral Metropolitana, Guadalajara": "La catedral más importante de Jalisco, construida entre 1561 y 1618. Sus torres gemelas y vitrales europeos la convierten en el símbolo más reconocible de Guadalajara.",
  "Palacio de Gobierno de Jalisco, Guadalajara": "Sede del gobierno estatal con los famosos murales de José Clemente Orozco que retratan al cura Hidalgo. Acceso gratuito para admirar su arquitectura barroca colonial.",
  "Rotonda de los Jaliscienses Ilustres, Guadalajara": "Mausoleo circular que honra a los grandes personajes de Jalisco. Sus columnas dóricas y jardines junto a la Catedral crean uno de los espacios más fotogénicos del centro histórico.",
  "Museo del Periodismo y las Artes Gráficas, Guadalajara": "Instalado en la Casa de los Perros, edificio barroco del siglo XVIII. Exhibe la historia del periodismo y la imprenta en México con valiosas piezas históricas originales.",
  "Expiatorio del Santísimo Sacramento, Guadalajara": "Majestuosa iglesia neogótica construida entre 1897 y 1972. Sus rosetones y vitrales importados de Alemania la convierten en una de las más bellas y fotografiadas de Guadalajara.",
  "Centro Histórico de Tlaquepaque, Guadalajara": "Pueblo Mágico y corazón artesanal de Jalisco. Calles empedradas con galerías de arte, talleres de artesanos, restaurantes y vida nocturna a minutos de Guadalajara.",
  "El Parián de Tlaquepaque, Guadalajara": "Recinto gastronómico y cultural en el corazón de Tlaquepaque. Mariachis en vivo, birria y tequila en un espacio colonial; visita obligada para cualquier turista.",
  "Plaza de Armas, Guadalajara": "La plaza principal de Guadalajara desde el siglo XVI, rodeada por la Catedral y el Palacio de Gobierno. Su quiosco modernista de hierro francés es una joya fotográfica.",
  "Casa Museo López Portillo, Guadalajara": "Residencia neoclásica del siglo XIX en el Centro Histórico. Alberga exposiciones de arte, historia y cultura jalisciense en una elegante arquitectura colonial.",
  // ── Fútbol / Eventos ─────────────────────────────────────────────────────────
  "Estadio Akron, Guadalajara": "Sede oficial del Mundial 2026 en Guadalajara. Estadio de clase mundial con capacidad para 49,850 aficionados y casa del Club Deportivo Guadalajara.",
  "Glorieta de la Minerva, Guadalajara": "Icónico monumento en honor a la diosa Minerva. Punto de referencia tapatío en la avenida Vallarta y símbolo de la identidad de la ciudad.",
  "Museo Chivas, Guadalajara": "Museo interactivo del Club Deportivo Guadalajara. Recorre la historia del equipo más campeón de México con exhibiciones de trofeos y jerseys históricos.",
  // ── Naturaleza ───────────────────────────────────────────────────────────────
  "Bosque Colomos, Guadalajara": "Pulmón verde de Guadalajara con 90 hectáreas de bosque urbano. Alberga el jardín japonés más grande de América Latina; ideal para caminatas y desconexión.",
  "Parque Agua Azul, Guadalajara": "El parque público más grande del centro de Guadalajara. Jardines tropicales, orquideario, mariposario y espacios culturales en un oasis verde de acceso libre.",
  // ── Compras ──────────────────────────────────────────────────────────────────
  "La Gran Plaza Fashion Mall, Guadalajara": "Uno de los centros comerciales más grandes de Latinoamérica con más de 300 tiendas, restaurantes y entretenimiento en la zona metropolitana.",
  // ── Gastronomía mexicana ─────────────────────────────────────────────────────
  "Tortas Ahogadas \"El Güerito\", Guadalajara": "Pan birote bañado en salsa de chile de árbol: el antojito callejero más representativo de Guadalajara. Un clásico imperdible cerca del Centro Histórico.",
  "Tortas Ahogadas Don Jose El De La Bicicleta, Guadalajara": "Uno de los puestos más populares de tortas ahogadas en Guadalajara. Tradición familiar y receta auténtica que ha conquistado generaciones de tapatíos.",
  "Santo Coyote Real, Guadalajara": "Icónico restaurante mexicano creativo en un jardín encantador con fuentes y velas. Famoso por su sopa Azteca y ambiente bohemio; una experiencia sensorial completa.",
  "Santo Coyote, Guadalajara": "Cocina mexicana creativa con ambiente bohemio y jardín en la Colonia Americana. Sucursal del icónico Santo Coyote; perfecto para una cena especial en Guadalajara.",
  "La Bodega de León, Guadalajara": "Cocina mexicana contemporánea en un espacio íntimo y elegante. Menú variado con ingredientes locales; ideal para cenas románticas en el barrio Americana.",
  "Mutante Restaurante, Guadalajara": "Restaurante de cocina mexicana de autor con música en vivo y ambiente vanguardista. Menú rotativo con ingredientes de temporada en la vibrante Colonia Americana.",
  "Karne Garibaldi (Santa Tere), Guadalajara": "Récord Guinness al servicio de restaurante más rápido del mundo. Carne en su jugo servida en tiempo récord; una experiencia única de la gastronomía tapatía.",
  "Karne Garibaldi Sucursal Tlaquepaque, Guadalajara": "Sucursal del famoso Récord Guinness cerca de Tlaquepaque. Carne en su jugo a velocidad récord; imperdible antes de explorar las artesanías del Pueblo Mágico.",
  "Karne Garibaldi Sucursal Plaza Del Sol, Guadalajara": "Sucursal del icónico Récord Guinness en la zona de Plaza del Sol. Carne en su jugo en tiempo récord; parada obligada en el sur de la ciudad.",
  "El Sacromonte, Guadalajara": "Cocina mexicana de autor en el barrio Americana. Ingredientes locales con presentaciones contemporáneas que preservan los sabores tradicionales jaliscienses en ambiente elegante.",
  "Los Famosos Equipales, Guadalajara": "Cocina tapatía auténtica en sillas de madera y cuero típicas de Jalisco. Birria de res y platillos regionales con el ambiente más genuino del norte de la ciudad.",
  "La Chata, Guadalajara": "Institución gastronómica de Guadalajara desde 1942. Pozole, birria y sopes en el centro histórico; referencia obligada para conocer la cocina tapatía auténtica.",
  "La Chata Terranova, Guadalajara": "Sucursal de la institución gastronómica desde 1942. Los mismos sabores clásicos de pozole rojo y birria en la zona Providencia; tradicional desde el desayuno.",
  "Birriería Las Nueve Esquinas, Guadalajara": "La birria de chivo más emblemática de Guadalajara en el pintoresco barrio de las Nueve Esquinas. Receta familiar con más de 80 años de tradición jalisciense.",
  "Tacos Providencia, Guadalajara": "Tacos de guisado casero en la zona Providencia; punto de encuentro de tapatíos para un almuerzo rápido y auténtico con salsas caseras a tu gusto.",
  "Tacos Providencia Ruben Daria, Guadalajara": "Tacos de guisado en estilo casero tapatío sobre la avenida Rubén Darío. Sabores reconfortantes de la cocina diaria de Guadalajara a precios muy accesibles.",
  "Los Laureles (Av. México), Guadalajara": "Cocina mexicana casera y reconfortante sobre la avenida México. Caldos y guisados con técnica tradicional en porciones generosas; favorito de familias tapatías.",
  "Restaurante Casa Luna, Guadalajara": "Ambiente romántico y colonial en el corazón de Tlaquepaque con cocina mexicana artesanal. Música en vivo y postres de autor; ideal para una cena especial.",
  "Cantina La Fuente, Guadalajara": "Una de las cantinas más antiguas del Centro Histórico, fundada en 1921. Ambiente de época, botanas sin costo, música en vivo y selección de tequilas jaliscienses.",
  "Pozole El Pollo, Guadalajara": "Pozole rojo de pollo con receta casera en el barrio Santa Teresita. Tortillas hechas a mano y todas las guarniciones tradicionales; contundente y económico.",
  "Tikuun comedor, Guadalajara": "Cocina mexicana gourmet inspirada en raíces prehispánicas. Técnicas modernas con ingredientes nativos en un ambiente íntimo; experiencia culinaria única en Guadalajara.",
  "Rosarito, Guadalajara": "Ambiente vibrante en Chapultepec con cocina mexicana y mariscos. Terraza popular para cenar y beber en una de las zonas más animadas de Guadalajara.",
  "Restaurante Casa Caborca Asador de Carnes Zapopan, Guadalajara": "Asador de cortes sonorenses en Zapopan. Carnes de primera calidad al estilo norteño con ambiente auténtico; favorito de familias los fines de semana.",
  "Cuerno Andares": "Cocina mexicana moderna en el exclusivo desarrollo Andares. Ambiente sofisticado con sabores contemporáneos a pasos de las mejores tiendas del poniente.",
  "Mantela Restaurante": "Restaurante de chef con cocina mexicana de temporada en Andares. Ingredientes frescos y presentaciones de arte culinario en un marco elegante.",
  "Mochomos Guadalajara": "Cocina sonorense con los mejores cortes de carne de la ciudad. Carne asada y burritos norteños en ambiente festivo; perfecto para grupos grandes.",
  "Cotidiano - Restaurante en La Perla": "Cocina de mercado en La Perla Tapatía con menú diario de ingredientes frescos. Ambiente acogedor y accesible; reflejo genuino de la comida cotidiana de calidad.",
  "Casa Prime Puerta de Hierro": "Restaurante de cortes premium en la exclusiva zona de Andares. Carnes importadas y locales en un ambiente íntimo y refinado.",
  // ── Internacional / Moderno ──────────────────────────────────────────────────
  "La Boca Parrilla Rustica, Guadalajara": "Parrilla rústica con cortes de carne premium en la Colonia Americana. Ambiente animado con carnes al carbón y guarniciones generosas; ideal para carnívoros exigentes.",
  "CRAFT Americana, Guadalajara": "Hamburguesas artesanales y cervezas craft en la Colonia Americana. Ambiente informal y animado con música; perfecto para un almuerzo o cena entre amigos.",
  "Argento Americana, Guadalajara": "Cocina argentina con toque mexicano en el barrio Americana. Empanadas crujientes y carnes a la parrilla en un ambiente tranquilo y acogedor.",
  "PINOCCHIO - Pedro Moreno, Guadalajara": "Cocina italiana contemporánea en el corredor gastronómico de Pedro Moreno. Pastas artesanales y antipastos en un espacio moderno y animado.",
  "Romea, Guadalajara": "Restaurante mediterráneo con ambiente sofisticado en Vallarta. Mariscos frescos y sabores del sur de Europa con coctelería de diseño y música en vivo.",
  "Tyrano, Guadalajara": "Cocina de autor y coctelería de diseño en el corazón de Guadalajara. Ambiente elegante ideal para cenas largas con música seleccionada.",
  "Hueso Restaurante, Guadalajara": "Restaurante de alta cocina con diseño único rodeado de huesos y referencias óseas. Una experiencia gastronómica y visual única en el barrio Americana.",
  "Angelina Bistro, Guadalajara": "Bistró de cocina europea con toque mexicano en el poniente de Guadalajara. Brunch los fines de semana y cenas románticas entre semana con música en vivo.",
  // ── Cantinas / Nocturnos ─────────────────────────────────────────────────────
  "Cantina La Fuente, Guadalajara": "Una de las cantinas más antiguas del Centro Histórico, fundada en 1921. Ambiente de época, botanas sin costo, música en vivo y selección de tequilas jaliscienses.",
  "De La O Cantina, Guadalajara": "Cantina moderna con ambiente artístico en Santa Teresita. Cócteles creativos y botanas de autor; punto de encuentro de creativos y noctámbulos tapatíos.",
  "Taberna Central, Guadalajara": "Cocina de mercado y cervezas artesanales en el Centro de Guadalajara. Ambiente relajado que mezcla tradición e innovación; ideal antes de una noche de bares.",
  "Ay! Caguamas Ciudad Granja, Guadalajara": "El spot para botanas y caguamas en Ciudad Granja. Ambiente relajado y festivo muy popular entre jóvenes tapatíos para una tarde-noche desenfadada.",
  // ── Veganos ──────────────────────────────────────────────────────────────────
  "Tía Ofe Pozole Vegano, Guadalajara": "Pozole vegano con caldo rico y todas las guarniciones tradicionales. Una opción saludable y auténtica que conquista también a los más carnívoros.",
  "Choclo y Maiz Cocina Vegana": "Cocina vegana mexicana con platillos creativos a base de maíz. Sabores que sorprenden incluso a los más carnívoros; opción saludable y deliciosa.",
  "El Vegano": "Restaurante 100% vegano con opciones de cocina mexicana e internacional. Ambiente acogedor con menú variado que satisface tanto a veganos convencidos como a curiosos.",
  // ── Postres / Dulces ─────────────────────────────────────────────────────────
  "Nieves Chapalita Tepeyac, Guadalajara": "Nieves artesanales de garrafa elaboradas con métodos tradicionales en Chapalita. Sabores únicos como mamey, guanábana y rompope en un negocio familiar.",
  "Nieves de Garrafa Chapalita Juárez, Guadalajara": "Nieves de garrafa artesanales en el corazón de Tlaquepaque. Sabores regionales únicos como chongos y chilacayote que solo encuentras en puestos tradicionales jaliscienses.",
  "Nieves de Garrafa Chapalita Gourmet, Guadalajara": "Versión gourmet de las tradicionales nieves de garrafa jaliscienses. Sabores creativos y de temporada en Tlaquepaque; el postre perfecto del recorrido artesanal.",
  "Churros \"La Bombilla\", Guadalajara": "Churros artesanales crujientes con chocolate caliente en el corazón de Guadalajara. Una tradición dulce para rematar un día de turismo por el Centro Histórico.",
  "Dulces Regionales \"Nuestros Dulces\", Guadalajara": "Tienda de dulces típicos jaliscienses en el Centro Histórico. Mazapanes, ates de membrillo y cajeta artesanal; el mejor souvenir comestible para llevar de Guadalajara.",
  "Osteria 10, Guadalajara": "Repostería italiana y platillos ligeros en la Colonia Americana. Ambiente acogedor con dulces artesanales y opciones de pasta; perfecto para una pausa gourmet.",
  // ── Cafeterías ───────────────────────────────────────────────────────────────
  "Café Sinergia, Guadalajara": "Cafetería acogedora en la Colonia Americana muy popular entre trabajadores y estudiantes. Bebidas de especialidad y desayunos en un ambiente creativo.",
  "Café Rozita, Guadalajara": "Cafetería con carácter cerca del barrio San Juan de Dios. Bebidas especiales y repostería artesanal; favorita de artistas y creativos locales.",
  "Café Boutique Teatro Degollado, Guadalajara": "Pequeña joya junto al Teatro Degollado. El lugar ideal para una pausa cultural con café artesanal antes o después de un espectáculo.",
  "Fragante Café, Guadalajara": "Café de especialidad en el Centro Histórico. Granos de origen con métodos de preparación alternativos para amantes del café serio.",
  "Happy Coffee, Guadalajara": "Cafetería colorida y animada en Zapopan. Bebidas especiales y desayunos en un ambiente festivo que llena de energía el día.",
  "Moka Moments Cafetería, Guadalajara": "Cafetería acogedora en el norte de la ciudad. Bebidas calientes y frías con repostería artesanal para pausar el día con estilo.",
  "Aloó Café, Guadalajara": "Café de especialidad en la Colonia Ladrón de Guevara. Ambiente minimalista con bebidas de autor y repostería fresca; ideal para iniciar bien la mañana.",
  "Kalido Café, Guadalajara": "Cafetería moderna en la Colonia Americana con bebidas creativas y leches vegetales. Opciones para dietas especiales en un espacio luminoso.",
  "Gufo Café, Guadalajara": "Café de especialidad en Chapultepec. Granos de origen y métodos alternativos en un ambiente tranquilo; favorita de los amantes del café serio.",
  "Fika, Guadalajara": "Cafetería inspirada en la tradición escandinava. Café artesanal con repostería nórdica en el sur de Guadalajara; una experiencia diferente.",
  "Estresso Café, Guadalajara": "Cafetería en Providencia especializada en espresso y opciones frías. Bebidas rápidas de calidad para el ritmo acelerado del norte de la ciudad.",
  "El Terrible Juan Café La Estancia, Guadalajara": "Cafetería rústica en la zona de Andares. Desayunos completos y café de origen en un ambiente familiar con terraza.",
  "Entre Matices Café, Guadalajara": "Café de especialidad en Chapalita con métodos alternativos. Granos seleccionados y opciones de temporada en un espacio íntimo.",
  "Jardín Cafeto Providencia, Guadalajara": "La cadena más querida de Guadalajara en Providencia. Jardín al aire libre con café de especialidad; punto de encuentro del barrio desde las 7:30 am.",
  "Jardín Cafeto La Americana, Guadalajara": "Jardín Cafeto en la Colonia Americana. Café de especialidad en ambiente de jardín; referencia del desayuno tapatío en una de las zonas más cosmopolitas.",
  "Jardín Cafeto Chapalita, Guadalajara": "Sucursal de Jardín Cafeto en el tranquilo barrio de Chapalita. Jardín característico con café artesanal y atención cálida.",
  "The Coffee Aledén Puerta, Guadalajara": "Cafetería The Coffee en Zapopan. Bebidas frías y calientes en ambiente moderno; parada conveniente en la zona universitaria.",
  "The Coffee Legacy Tower, Guadalajara": "The Coffee en la imponente Legacy Tower. Café de calidad en el edificio más alto de la ciudad con vistas del skyline tapatío.",
  "The Coffee Cd. Granja, Guadalajara": "The Coffee en Ciudad Granja. Bebidas de especialidad en ambiente moderno para los habitantes del poniente de Guadalajara.",
  "The Spot Café, Guadalajara": "Cafetería moderna en Providencia. Bebidas de autor y repostería en un espacio tranquilo ideal para trabajar o reunirse con amigos.",
  "Recoleta Confitería Argentina Tepeyac, Guadalajara": "Confitería argentina en Chapalita. Medialunas auténticas y café estilo Buenos Aires; un pedazo de Argentina en Guadalajara.",
  "Recoleta Confitería Argentina La Perla, Guadalajara": "Confitería argentina en La Perla Tapatía. Facturas y medialunas con café; el sabor de Buenos Aires en el sur de Guadalajara.",
};

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();

async function run() {
  const snap = await db.collection('lugares').get();
  console.log(`\nRevisando ${snap.size} lugares...\n`);
  let actualizados = 0;

  for (const doc of snap.docs) {
    const nombre = doc.data().nombre || '';
    // Buscar coincidencia exacta o normalizada
    let desc = DESCRIPCIONES[nombre];
    if (!desc) {
      // Buscar sin ciudad al final
      const nombreBase = nombre.replace(/,\s*(Guadalajara|Zapopan|Tlaquepaque|Tonalá)[^,]*/i, '').trim();
      desc = DESCRIPCIONES[nombreBase] || DESCRIPCIONES[nombre + ', Guadalajara'];
    }
    if (desc && !doc.data().descripcion?.trim()) {
      await doc.ref.update({ descripcion: desc, ultimaActualizacion: new Date().toISOString() });
      console.log(`✓ ${nombre}`);
      actualizados++;
    }
  }

  console.log(`\n✅ ${actualizados} lugar(es) actualizados con descripción.`);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
