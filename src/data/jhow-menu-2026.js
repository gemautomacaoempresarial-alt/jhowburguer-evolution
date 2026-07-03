const CATEGORY_ORDER = [
  'Marmitex - Almoço',
  'Lanches Tradicionais',
  'Lanches Gourmet',
  'Adicionais',
  'Pizzas Tradicionais',
  'Pizzas Especiais',
  'Pizzas Doces',
  'Bordas de Pizza',
  'Porções',
  'Caldos',
  'Espetinhos',
  'Churrasco',
  'Jantinha',
  'Refrigerantes',
  'Sucos',
  'Cervejas',
  'Doses',
  'Drinks',
  'Energéticos',
  'Diversos',
  'Chopp',
];

function product(category, name, description, price, aliases = '') {
  return { category, name, description, price: Number(price), aliases };
}

const menu = [];
const add = (...args) => menu.push(product(...args));

// Cardápio de almoço — disponível diariamente das 09:00 às 14:00.
// As escolhas de arroz, feijão, guarnições e salada são registradas nas
// observações do item pelo site e pelo atendimento com IA.
[
  ['P', false, 14], ['P', true, 16],
  ['M', false, 16], ['M', true, 18],
  ['G', false, 18], ['G', true, 20],
].forEach(([size, withBarbecue, price]) => {
  const type = withBarbecue ? 'Com Churrasco' : 'Sem Churrasco';
  const meatText = withBarbecue
    ? 'churrasco'
    : 'filé de peixe empanado ou estrogonofe de frango';
  add(
    'Marmitex - Almoço',
    `Marmitex ${size} - ${type}`,
    `Marmitex tamanho ${size} com ${meatText}. Escolha 1 arroz, 1 feijão, 2 guarnições entre batata frita, macarronese e purê de batata, além de com ou sem salada. Disponível das 09:00 às 14:00.`,
    price,
    `marmita ${size} ${type}, marmitex ${size} ${type}, quentinha ${size} ${type}, almoço ${size} ${type}`,
  );
});

// Lanches tradicionais
add('Lanches Tradicionais', 'Americano', 'Ovo, presunto, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 16, 'lanche americano');
add('Lanches Tradicionais', 'Calabresa Especial', 'Calabresa, ovo, presunto, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 18, 'x calabresa especial, lanche calabresa especial');
add('Lanches Tradicionais', 'Misto Especial', 'Presunto, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 13, 'misto, misto especial');
add('Lanches Tradicionais', 'Hambúrguer', 'Carne artesanal, alface, tomate, milho, batata palha, molho especial e maionese.', 16, 'hamburguer, hamburger, burger simples');
add('Lanches Tradicionais', 'Hambúrguer Especial', 'Carne artesanal, ovo, alface, tomate, milho, batata palha, molho especial e maionese.', 17, 'hamburguer especial, hamburger especial');
add('Lanches Tradicionais', 'X-Burguer Salada', 'Carne artesanal, muçarela, tomate, alface, milho, batata palha, molho especial e maionese.', 17, 'x salada, x-salada, xis salada, x burguer salada');
add('Lanches Tradicionais', 'X-Burguer Especial', 'Carne artesanal, ovo, presunto, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 18, 'x burguer especial, xburger especial, xis burguer especial');
add('Lanches Tradicionais', 'X-Bacon', 'Carne artesanal, bacon, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 18, 'x bacon, xbacon, xis bacon');
add('Lanches Tradicionais', 'X-Bacon Egg', 'Carne artesanal, bacon, ovo, muçarela, tomate, alface, milho, batata palha, molho especial e maionese.', 19, 'x bacon egg, xbacon egg, x bacon ovo');
add('Lanches Tradicionais', 'X-Frango', 'Frango desfiado, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 16, 'x frango, xfrango, xis frango');
add('Lanches Tradicionais', 'X-Egg Frango', 'Frango desfiado, ovo, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 17, 'x egg frango, x frango egg, x frango com ovo');
add('Lanches Tradicionais', 'X-Calafrango', 'Calabresa, frango, muçarela, alface, tomate, batata palha, milho, molho especial e maionese.', 17, 'x calafrango, calafrango');
add('Lanches Tradicionais', 'X-Frambol', 'Carne artesanal, frango, muçarela, alface, tomate, batata palha, milho, molho especial e maionese.', 20, 'x frambol, frambol');
add('Lanches Tradicionais', 'Especial da Casa', 'Duas carnes artesanais, frango, bacon, muçarela, alface, tomate, milho, batata palha, molho especial e maionese.', 27, 'lanche especial da casa');
add('Lanches Tradicionais', 'X-Tudo', 'Carne artesanal, frango, bacon, ovo, calabresa, presunto, muçarela, alface, tomate, batata palha, milho, molho especial e maionese.', 26, 'x tudo, xtudo, xis tudo');
add('Lanches Tradicionais', 'X-Bacon Frango', 'Frango desfiado, bacon, muçarela, milho, tomate, alface, batata palha, molho especial e maionese.', 18, 'x bacon frango, xbacon frango');
add('Lanches Tradicionais', 'X-Bacon Frango Especial', 'Carne artesanal, frango desfiado, bacon, muçarela, milho, alface, tomate, batata palha, molho especial e maionese.', 24, 'x bacon frango especial, xbacon frango especial');

// Lanches gourmet
add('Lanches Gourmet', 'Smash Duplo Cheddar', 'Carne artesanal de 150 g, pão com gergelim, bacon, dupla camada de cheddar, alface, tomate e batata frita palito.', 26, 'smach duplo cheddar, smash cheddar, duplo cheddar');
add('Lanches Gourmet', 'Smash Duplo Bacon', 'Carne artesanal de 150 g, pão com gergelim, dupla camada de bacon, cheddar, cebola roxa, alface, tomate e batata frita palito.', 29, 'smach duplo bacon, smash bacon, duplo bacon');
add('Lanches Gourmet', 'Smash Tudo em Dobro', 'Duas carnes artesanais de 150 g, pão com gergelim, bacon em dobro, cheddar em dobro, alface, tomate e batata frita palito.', 31, 'smach tudo em dobro, smash tudo dobro');
add('Lanches Gourmet', 'Smash Filé Mignon', 'Pão baguete, filé mignon, bacon, cheddar, cebola roxa, alface, tomate, molho especial e batata frita palito.', 30, 'smach file mignon, smash filé, smash file');
add('Lanches Gourmet', 'Smash Infantil', 'Hambúrguer, batata frita palito, suco 350 ml ou refrigerante mini 200 ml e surpresa.', 27, 'smach infantil, lanche infantil, combo infantil');

// Adicionais
[
  ['Carne Artesanal', 7], ['Bacon', 6], ['Cheddar', 6], ['Presunto', 4], ['Muçarela', 4],
  ['Ovo', 2.5], ['Frango', 6], ['Calabresa', 5],
].forEach(([name, price]) => add('Adicionais', `Adicional de ${name}`, `Porção adicional de ${name.toLowerCase()} para complementar seu lanche.`, price, `extra ${name}, adicional ${name}`));

// Pizzas: cada sabor é cadastrado em todos os tamanhos para manter preço e tamanho exatos.
const pizzaSizes = [
  ['Mini', 4, 39.9],
  ['Pequena', 6, 44.9],
  ['Média', 8, 49.9],
  ['Grande', 10, 59.9],
  ['Gigante', 12, 64.9],
];

const pizzaFlavors = [
  ['Pizzas Tradicionais', 'A Moda', 'Muçarela, presunto, calabresa, milho, tomate, cebola, azeitona, pimentão e orégano.'],
  ['Pizzas Tradicionais', 'A Moda do Chefe', 'Muçarela, frango, bacon, palmito, calabresa, milho e catupiry.'],
  ['Pizzas Tradicionais', 'Atum Especial', 'Muçarela, atum, palmito, catupiry, azeitona e orégano.'],
  ['Pizzas Tradicionais', 'Bacon', 'Muçarela, bacon e orégano.'],
  ['Pizzas Tradicionais', 'Brasileira', 'Muçarela, calabresa, frango, azeitona, pimentão, tomate, cebola e orégano.'],
  ['Pizzas Tradicionais', 'Calabresa', 'Muçarela, calabresa, cebola e orégano.'],
  ['Pizzas Tradicionais', 'Caipira', 'Muçarela, frango, ovo, bacon, milho, azeitona e orégano.'],
  ['Pizzas Tradicionais', 'Carne Seca', 'Muçarela, carne seca, milho, catupiry e orégano.'],
  ['Pizzas Especiais', 'Cinco Carnes', 'Muçarela, calabresa, presunto, lombo canadense, salaminho, bacon e orégano.'],
  ['Pizzas Especiais', 'Sabor Especial', 'Muçarela, frango, bacon, ovo, tomate, pimentão, cebola, azeitona e orégano.'],
  ['Pizzas Especiais', 'Francesa', 'Muçarela, lombo canadense, creme de leite e orégano.'],
  ['Pizzas Especiais', 'Frango Catupiry', 'Muçarela, frango, catupiry, milho, azeitona e orégano.'],
  ['Pizzas Especiais', 'Frango à Bolonhesa', 'Muçarela, frango, molho à bolonhesa, creme de leite e orégano.'],
  ['Pizzas Especiais', 'Lombo Canadense', 'Muçarela, lombo canadense e orégano.'],
  ['Pizzas Especiais', 'Parmegiana de Frango', 'Muçarela, frango, palmito, molho à bolonhesa e orégano.'],
  ['Pizzas Especiais', 'Palmito à Bolonhesa', 'Muçarela, palmito, molho à bolonhesa e orégano.'],
  ['Pizzas Especiais', 'Mexicana', 'Muçarela, calabresa, molho à bolonhesa, tomate, azeitona, milho e orégano.'],
  ['Pizzas Especiais', 'Pizzaiolo', 'Muçarela, calabresa, bacon, pimentão, milho, azeitona e orégano.'],
  ['Pizzas Especiais', 'Portuguesa', 'Muçarela, presunto, cebola, ovo, azeitona e orégano.'],
  ['Pizzas Especiais', 'Vegetariana', 'Muçarela, pimentão, tomate, azeitona, milho, cebola, palmito e orégano.'],
  ['Pizzas Especiais', 'Do Chefe', 'Apresuntado, milho, muçarela, palmito, bacon, creme de leite, azeitona, pimentão e orégano.'],
  ['Pizzas Especiais', 'Quatro Queijos', 'Muçarela, provolone, parmesão, catupiry e orégano.'],
  ['Pizzas Doces', 'Banana com Canela', 'Muçarela, banana, leite condensado e canela.'],
  ['Pizzas Doces', 'Brigadeiro', 'Chocolate, creme de leite, leite condensado e granulado.'],
  ['Pizzas Doces', 'Prestígio', 'Chocolate, creme de leite, coco ralado e leite condensado.'],
  ['Pizzas Doces', 'Romeu e Julieta', 'Muçarela, goiabada e leite condensado.'],
];

for (const [category, flavor, description] of pizzaFlavors) {
  for (const [size, pieces, price] of pizzaSizes) {
    add(category, `Pizza ${flavor} - ${size} (${pieces} pedaços)`, description, price,
      `pizza ${flavor} ${size}, ${flavor} ${size}, pizza de ${flavor} ${size}, pizza ${flavor}`);
  }
}

[
  ['Mini', 2], ['Pequena', 4], ['Média', 6], ['Grande', 8], ['Gigante', 10],
].forEach(([size, price]) => add('Bordas de Pizza', `Borda Recheada - Pizza ${size}`, `Borda recheada para pizza de tamanho ${size.toLowerCase()}. Informe o sabor da borda nas observações do item.`, price, `borda ${size}, borda recheada ${size}`));

// Porções
const portions = [
  ['Porção Mista', 52, 62, '325 g de carne de sol, 200 g de fritas e 200 g de mandioca.', '450 g de carne de sol, 300 g de fritas e 300 g de mandioca.'],
  ['Porção de Fritas com Cheddar e Queijo', 20, 25, '350 g de batatas fritas com cheddar e queijo.', '500 g de batatas fritas com cheddar e queijo.'],
  ['Porção de Mandioca com Queijo', 20, 25, '450 g de mandioca com queijo.', '600 g de mandioca com queijo.'],
  ['Porção de Carne de Sol com Fritas', 47, 57, '325 g de carne de sol e 400 g de fritas.', '450 g de carne de sol e 400 g de fritas.'],
  ['Porção de Carne de Sol com Mandioca', 47, 57, '325 g de carne de sol e 400 g de mandioca.', '450 g de carne de sol e 500 g de mandioca.'],
  ['Porção de Filé de Tilápia', 55, 65, '300 g de filé de tilápia e 200 g de fritas.', '450 g de filé de tilápia e 300 g de fritas.'],
  ['Porção de Filé de Frango', 40, 50, '325 g de filé de frango e 200 g de fritas ou mandioca.', '450 g de filé de frango e 300 g de fritas ou mandioca.'],
  ['Porção de Filé Mignon Simples', 52, 62, '325 g de filé mignon e 400 g de mandioca ou fritas.', '450 g de filé mignon e 500 g de mandioca ou fritas.'],
  ['Porção de Filé Mignon Mista', 60, 70, '325 g de filé mignon, 200 g de mandioca e 200 g de fritas.', '450 g de filé mignon, 300 g de mandioca e 300 g de fritas.'],
  ['Porção de Fígado Acebolado', 15, 25, '400 g de fígado acebolado.', '650 g de fígado acebolado.'],
  ['Porção de Frango a Passarinho', 25, 35, '400 g de frango a passarinho.', '700 g de frango a passarinho.'],
  ['Porção de Torresmo', 13, 25, 'Meia porção de torresmo.', 'Porção inteira de torresmo.'],
];
for (const [name, halfPrice, fullPrice, halfDescription, fullDescription] of portions) {
  add('Porções', `${name} - Meia`, halfDescription, halfPrice, `${name} meia, meia ${name}`);
  add('Porções', `${name} - Inteira`, fullDescription, fullPrice, `${name} inteira, inteira ${name}`);
}
add('Porções', 'Porção de Picanha na Chapa ou Filé Mignon - Inteira', '500 g de picanha ou filé mignon, 500 g de mandioca frita, 500 g de fritas, 500 g de linguiça calabresinha e 500 g de filé de frango empanado.', 120, 'picanha na chapa, porção filé mignon grande');

// Caldos e espetinhos
add('Caldos', 'Caldo de Mandioca', 'Caldo de mandioca com torresmo e cebolinha.', 9, 'caldo mandioca');
add('Caldos', 'Caldo de Mocotó', 'Caldo de mocotó com torresmo e cebolinha.', 10, 'caldo mocoto');
add('Caldos', 'Caldo de Feijão', 'Caldo de feijão com torresmo e cebolinha.', 9, 'caldo feijao');
[
  ['Espetinho de Boi', 8], ['Espetinho de Porco', 6], ['Espetinho de Medalhão', 9],
  ['Espetinho de Coraçãozinho', 7], ['Espetinho de Linguiça', 6], ['Espetinho de Meio da Asa', 8], ['Pão de Alho', 7],
].forEach(([name, price]) => add('Espetinhos', name, 'Acompanha farofa e vinagrete.', price, name.replace('Espetinho de ', 'espetinho ')));

// Churrasco
const barbecue = [
  ['Picanha Simples', 60, 110, '450 g de picanha, farofa e vinagrete.', '900 g de picanha, farofa e vinagrete.'],
  ['Picanha Completa', 80, 149.9, '450 g de picanha, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de picanha, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Contra Filé Simples', 45, 90, '450 g de contra filé, farofa e vinagrete.', '900 g de contra filé, farofa e vinagrete.'],
  ['Contra Filé Completa', 90, 120, '450 g de contra filé, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de contra filé, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Alcatra Simples', 45, 90, '450 g de alcatra, farofa e vinagrete.', '900 g de alcatra, farofa e vinagrete.'],
  ['Alcatra Completa', 90, 120, '450 g de alcatra, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de alcatra, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Lagarto Simples', 45, 80, '450 g de lagarto, farofa e vinagrete.', '900 g de lagarto, farofa e vinagrete.'],
  ['Lagarto Completa', 55, 110, '450 g de lagarto, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de lagarto, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Maçã de Peito Simples', 35, 70, '450 g de maçã de peito, farofa e vinagrete.', '900 g de maçã de peito, farofa e vinagrete.'],
  ['Maçã de Peito Completa', 45, 90, '450 g de maçã de peito, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de maçã de peito, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Cupim Simples', 45, 80, '450 g de cupim, farofa e vinagrete.', '900 g de cupim, farofa e vinagrete.'],
  ['Cupim Completa', 55, 110, '450 g de cupim, arroz, tropeiro, farofa, batata frita e vinagrete.', '900 g de cupim, arroz, tropeiro, farofa, batata frita e vinagrete.'],
  ['Medalhão com Frango e Bacon', 35, 60, '10 unidades, acompanha farofa e vinagrete.', '20 unidades, acompanha farofa e vinagrete.'],
  ['Coraçãozinho de Frango', 25, 50, '30 unidades, acompanha farofa e vinagrete.', '60 unidades, acompanha farofa e vinagrete.'],
  ['Tulipa', 30, 60, '12 unidades, acompanha farofa e vinagrete.', '24 unidades, acompanha farofa e vinagrete.'],
];
for (const [name, halfPrice, fullPrice, halfDescription, fullDescription] of barbecue) {
  add('Churrasco', `${name} - Meia`, halfDescription, halfPrice, `${name} meia, meia ${name}`);
  add('Churrasco', `${name} - Inteira`, fullDescription, fullPrice, `${name} inteira, inteira ${name}`);
}
add('Jantinha', 'Jantinha', 'Arroz, tropeiro, fritas, vinagrete, farofa e espetinho à escolha.', 17, 'jantinha com espetinho');
add('Jantinha', 'Frango Caipira (sob encomenda)', 'Frango cozido, arroz, tropeiro, maionese, vinagrete, pirão e fritas. Produto preparado sob encomenda.', 200, 'frango caipira, frango caipira sob encomenda');

// Refrigerantes
function addDrinkVariants(category, brand, variants, descriptionPrefix, brandAliases = '') {
  for (const [size, price, packaging = ''] of variants) {
    const packageText = packaging ? `, ${packaging}` : '';
    add(category, `${brand} ${size}${packageText}`, `${descriptionPrefix} no tamanho ${size}${packageText}.`, price,
      `${brandAliases ? `${brandAliases} ${size},` : ''} ${brand} ${size}${packaging ? `, ${brand} ${packaging}` : ''}`);
  }
}
addDrinkVariants('Refrigerantes', 'Coca-Cola', [['200 ml',3],['290 ml',4],['350 ml',5],['600 ml',7],['1L',8.5],['1,5L',12],['2L',14]], 'Refrigerante Coca-Cola', 'coca');
addDrinkVariants('Refrigerantes', 'Guaraná Antarctica', [['200 ml',3],['350 ml',5],['600 ml',6],['1L',7],['1,5L',10],['2L',12]], 'Refrigerante Guaraná Antarctica', 'guarana antartica, guarana');
addDrinkVariants('Refrigerantes', 'Fanta', [['200 ml',3],['290 ml',4],['350 ml',5],['600 ml',6],['1,5L',10],['2L',12]], 'Refrigerante Fanta');
addDrinkVariants('Refrigerantes', 'Sprite', [['200 ml',3],['290 ml',4],['350 ml',5],['600 ml',6],['2L',12]], 'Refrigerante Sprite');
addDrinkVariants('Refrigerantes', 'Sukita', [['200 ml',3],['350 ml',5],['2L',10]], 'Refrigerante Sukita');
addDrinkVariants('Refrigerantes', 'Pepsi', [['200 ml',3],['350 ml',5],['1L',7],['2L',12]], 'Refrigerante Pepsi');
add('Refrigerantes', 'FYS Guaraná 350 ml', 'Refrigerante FYS sabor guaraná, lata de 350 ml.', 5, 'fys guarana lata');
add('Refrigerantes', 'FYS Limão Siciliano 350 ml', 'Refrigerante FYS sabor limão siciliano, lata de 350 ml.', 5, 'fys limao siciliano lata');
add('Refrigerantes', 'FYS Laranja 350 ml', 'Refrigerante FYS sabor laranja, lata de 350 ml.', 5, 'fys laranja lata');

// Sucos
for (const flavor of ['Laranja', 'Maracujá', 'Acerola', 'Goiaba', 'Abacaxi', 'Del Valle / Kapo']) {
  add('Sucos', `Suco de ${flavor} - Copo`, `Suco sabor ${flavor.toLowerCase()}, servido no copo.`, 8, `suco ${flavor} copo`);
  add('Sucos', `Suco de ${flavor} - 750 ml`, `Suco sabor ${flavor.toLowerCase()}, garrafa de 750 ml.`, 16, `suco ${flavor} 750ml`);
  add('Sucos', `Suco de ${flavor} - 1,5L`, `Suco sabor ${flavor.toLowerCase()}, jarra de 1,5 litro.`, 25, `suco ${flavor} 1.5l`);
}
add('Sucos', 'Skinka 500 ml', 'Bebida Skinka de 500 ml.', 5, 'skinka meio litro');

// Cervejas
const beers = [
  ['Amstel', [['600 ml',9]]],
  ['Heineken', [['Latão',9.5],['Long Neck',9],['600 ml',15]]],
  ['Praya', [['Long Neck',8.5]]],
  ['Baden Baden', [['Latão',8]]],
  ['Spaten', [['Latão',8],['Long Neck',8.5],['600 ml',12]]],
  ['Budweiser', [['Litrinho',5],['Latão',8],['Long Neck',8.5],['600 ml',9.5]]],
  ['Brahma', [['Litrinho',5],['Latão',6],['600 ml',9]]],
  ['Antarctica Original', [['Litrinho',5],['Latão',8],['600 ml',12]]],
  ['Antarctica Boa', [['Litrinho',5],['Latão',6],['600 ml',9]]],
  ['Skol', [['Litrinho',5],['Latão',6],['600 ml',9]]],
  ['Bohemia', [['Litrinho',5],['Latão',6],['600 ml',9]]],
  ['Petra', [['600 ml',6.99]]],
  ['Corona', [['Latão',9.5],['Long Neck',9.5],['600 ml',16]]],
  ['Stella Artois', [['Latão',9],['Long Neck',9],['600 ml',13]]],
];
for (const [brand, variants] of beers) {
  for (const [packaging, price] of variants) {
    add('Cervejas', `Cerveja ${brand} - ${packaging}`, `Cerveja ${brand}, embalagem ${packaging.toLowerCase()}.`, price, `${brand} ${packaging}, cerveja ${brand}`);
  }
}

// Doses, drinks, energéticos, diversos e chopp
[
  ['Absolut',18],['Orloff',6],['Smirnoff',8],['Montilla',6],['Tanqueray',20],['Red Label',18],
  ['Black Label',25],['White Horse',15],['Passport',12],['Old Eight',10],['Old Parr',25],
  ["Ballantine's",18],['Jack Daniel’s',20],['Paratudo',4],['Jurubeba',4],['Campari',12],
  ['Conhaque Presidente',4],['Licor de Menta',3],['Licor de Pequi',3],['Licor de Canela',3],['Tequila',22],
].forEach(([name, price]) => add('Doses', `Dose de ${name}`, `Uma dose de ${name}.`, price, `dose ${name}, ${name}`));
[
  ['Caipimorango',20,'Drink preparado com morango.'],
  ['Caipiuva',20,'Drink preparado com uva.'],
  ['Caipirinha',13,'Caipirinha tradicional.'],
  ['Caipivodka',15,'Caipirinha preparada com vodka.'],
  ['Caipimaracujá',20,'Drink preparado com maracujá.'],
].forEach(([name, price, description]) => add('Drinks', name, description, price));
[
  ['Red Bull',13],['TNT',13],['Monster',13],['Baly',13],['Energético 2L',20],
].forEach(([name, price]) => add('Energéticos', name, `Bebida energética ${name}.`, price, name.replace('Energético', 'energetico')));
[
  ['Água Mineral',3,'Água mineral sem gás.'],
  ['Água Mineral com Gás',4,'Água mineral com gás.'],
  ['Água Tônica',6,'Água tônica.'],
  ['Skol Beats',10,'Bebida Skol Beats.'],
  ['Ice Cabaré',10,'Bebida Ice Cabaré.'],
  ['Caracu',7,'Cerveja Caracu.'],
  ['Gatorade',7,'Bebida isotônica Gatorade.'],
  ['H2O Limão/Limoneto',6,'Bebida H2O sabor limão/limoneto.'],
  ['Água Tônica FYS Lata 350 ml',4.5,'Água tônica FYS em lata de 350 ml.'],
].forEach(([name, price, description]) => add('Diversos', name, description, price));
[
  ['Caneca de Chopp',8,'Caneca de chopp.'],
  ['Chopp 1,5L',30,'Chopp servido em recipiente de 1,5 litro.'],
  ['Chopp 2,5L',50,'Chopp servido em recipiente de 2,5 litros.'],
  ['Chopp 3,5L',70,'Chopp servido em recipiente de 3,5 litros.'],
  ['Chopp de Vinho',10,'Chopp de vinho.'],
].forEach(([name, price, description]) => add('Chopp', name, description, price));

module.exports = {
  CATEGORY_ORDER,
  JHOW_MENU_2026: menu,
};
