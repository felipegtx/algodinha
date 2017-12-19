# Algodinha

Algoritmo de negociação automatizada para Bitcoin - via Foxbit / [Blinktrade](https://github.com/blinktrade/BlinkTradeJS).

## Sobre

O robô executa a estratégia [Scalper](https://www.daytraderpro.com.br/blog/o-que-e-scalping/), visando a execução de um grande volume de ordens de compra e venda com pequenos lucros entre si. A materialização desta estratégia depende basicamente da forma com que você parametrizará a execução do robô, principalmente no que tange o % de lucro esperado em cada operação e os valores das ordens em si. 

:exclamation: **IMPORTANTE:**

 - Não me responsabilizo por qualquer tipo de dano e/ou prejuizo causado durante e/ou decorrente do uso desta ferramenta. 
 - Lembra-se que [este repositório está disponível sob uma licença do tipo Apache 2.0](https://github.com/felipegtx/algodinha/blob/master/LICENSE).

## Instalando

Baixe o zip com o fonte ou realize o fork+clone deste Repo e, em seguida, baixe as dependêcias do projeto por meio do comando:

```javascript
npm install
```

## Configurando

### Segurança
Antes de executar o robô você precisa gerar suas credenciais de acesso na plataforma FoxBit. Você pode realizar isso clicando [aqui](https://foxbit.exchange/#api). 

Estes dados devem ser salvos em um arquivo chamado `api.json` na raiz da biblioteca utilizando o seguinte formato:

```javascript
{ 
    "user": "",
    "password": "",
    "secret": ""
}
```

### Email
O robô está programado para enviar email - utilizando GMail - relatando o envio e execução de ordens. 

Para que esta infra funcione você precisa apenas criar um arquivo chamado `mail.json` na raiz da biblioteca utilizando o seguinte formato:

```javascript
{
    "email" : "seu endereço de email do Gmail",
    "appPass" : "senha do gmail ou senha de app caso vc possua 2FA habilitado",
    "destino" : "endereço de destino"
}
```

### Parametrização
Você deve também parametrizar a execução considerando os limites e riscos que você está disposto a correr com a ferramenta. Os principais parâmetros que coordenam a proporção risco/lucro são os seguintes:

```javascript
/// Valor máximo para compra de BTC
valorMaximoCompra : 70000,

/// Valor máximo que o robô está autorizado a gastar
maximoGastos : 2000,

/// Valor das ordens de compra enviadas pelo robô
valorOrdem : 200,

/// Threshold que define o momento de rebalanceamento do valor de saída
///     - O robô faz uma média ponderada com os valores das compras e utiliza esta informação para 
///       decidir a melhor hora para sair
thresholdRecompraEmBRL : 50,

/// Lucro % esperado
lucroEsperado : 0.01,

//// Data da última venda realizada na plataforma ou, qualquer data no futuro caso vc
//// opte por iniciar vendido
dataBase : "2017-12-19 00:00:00"
```

De fato, como regra geral, estes são os únicos parâmetros que você precisaria alterar para realizar a execução.

#### Carteira

Na versão atual você precisa informar a data da sua última venda para que o robô consiga coletar as informações de sua carteira ativa. Para tanto, basta acessar sua conta na corretora encontrar qual a data/horário em que isto aconteceu. 

> Se for sua primeira operando em renda variável, você não deveria estar usando o robô. *#ficaDica*

Por exemplo, no seguinte caso:

![image](https://user-images.githubusercontent.com/1022404/34125435-5e516aa0-e41d-11e7-8ffc-3e4fc8e0a797.png)

A data seria `12/18/2017, 10:22:02 AM`, adicionados `duas horas` do fuso horário.
```
dataBase : "2017-12-18 12:22:02"
```

## Executando

Para executar, basta utilizar o seguinte comando:

```
node algodinha.js
```

## Status de execução

Se você quiser acompanhar o status do robô enquanto estiver longe do seu servidor/computador basta acessar o endereço: `http://ip_da_sua_maquina:1337/`


## Roadmap

Abaixo a lista de features que pretendo colocar no robô - PRs são bem vindos!

 - **Refazer saldo na venda parcial** - Quando o algoritmo decidir executar uma venda parcial, é preciso considerar este déficit de volume e melhor no saldo. Precisamos alterar também lógica do método `obterValorTotalGasto()` para refletir isso de forma dinâmica.
 
 ### Problemas conhecidos
 
  - **Demora na inicialização:** Em alguns momentos o snapshot do book pode demorar muito para chegar. É uma característica da infra da Blinktrade. Se isso acontecer com você (observável pela demora em iniciar o robô), basta cancelar a execução e executar novamente.
  
## Contribuição

Contribuições em forma de Bitcoin e/ou PRs são muito bem vindas! Peço apenas que antes de trabalhar/enviar uma PR entre em contato comigo para alinharmos as expectativas e approach da implementação.

**Envie contribuições em BTC para:** 18DGLBkigjyKdezHQtiWWkg9EmBLrqQtPF

