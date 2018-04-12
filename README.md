# Algodinha

Algoritmo de negociação automatizada para Bitcoin - via Foxbit / [Blinktrade](https://github.com/blinktrade/BlinkTradeJS).

## Sobre

O robô executa a estratégia [Scalper](https://www.daytraderpro.com.br/blog/o-que-e-scalping/), visando a execução de um grande volume de ordens de compra e venda com pequenos lucros entre si. A materialização desta estratégia depende basicamente da forma com que você parametrizará a execução do robô, principalmente no que tange o % de lucro esperado em cada operação e os valores das ordens em si. 

:exclamation: **IMPORTANTE:**

 - Não me responsabilizo por qualquer tipo de dano e/ou prejuizo causado durante e/ou decorrente do uso desta ferramenta. 
 - Lembre-se que [este repositório está disponível sob uma licença do tipo Apache 2.0](https://github.com/felipegtx/algodinha/blob/master/LICENSE).

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

#### Limites de operação
Os parâmetros abaixo limitam a operação do robô fazendo com que nada seja realizado se o mercado estiver acima do `valorMaximoCompra` ou abaixo do `valorMinimoCompra`.
```javascript
/// Valor máximo para compra de BTC
valorMaximoCompra : 70000,

/// Valor mínimo para compra de BTC (base do túnel de negociação)
valorMinimoCompra : 30000,
```

#### Orçamento
Os valores definidos nas variáveis abaixo ditam como o robô investirá o capital disponível - *if any*. 

O robô nunca gastará mais que o estipulado como o `maximoGastos` e gerará ordens de no máximo `valorMaximoOrdem` e, sempre que possível - veja detalhes abaixo - utilizará o `valorOrdem` para estas operações.

##### Valor máximo da ordem
Em uma situação onde for detectado que uma compra foi realizada em um valor superior ao disponível atualmente no mercado o valor da ordem poderá ser automaticamente ajustado utilizando o percentual de variação detectado: *Diferença % entre o valor mais alto pago pela fração da crypto e o valor atual da mesma.*

```javascript
/// Valor máximo que o robô está autorizado a gastar
maximoGastos : 2000,
/// Valor das ordens de compra enviadas pelo robô
valorOrdem : 200,
/// Valor máximo de cada ordem de compra. Se este valor for diferente do valor informado para "valorORdem", o rob^
/// realizará um ajuste no valor pago, acrescentando o percentual de custo atual frente ao custo inicial por BTC até
/// o limite de gastos definido aqui.
valorMaximoOrdem : 12,
```

### Outros dados operacionais
O robô considera também as informações de quanto você possuía em fiat na corretora antes de iniciar a operação (`valorInicial`) para detectar possíveis prejuízos e ajustar a forma de operação e valores de ordens. 
```javascript
/// Valor inicialmente depositado na corretora em fiat
valorInicial : 7000,
```

Para realização de atualização de valor médio o robô trabalha com um túnel dinâmico secundário que é ajustado baeado no `thresholdRecompraEmBRL`. Este túnel impede que sejam realizadas recompras se a flutuação do mercado não for considerada grande o suficiente - evitando operações sequenciais em valores muito próximos um ao outro. 
```javascript
/// Threshold que define o momento de rebalanceamento do valor de saída
///     - O robô faz uma média ponderada com os valores das compras e utiliza esta informação para 
///       decidir a melhor hora para sair
thresholdRecompraEmBRL : 50,
```

Qual o lucro total esperado após a execução do robô.
```javascript
/// Lucro % esperado
lucroEsperado : 0.01,
```

Na versão atual você precisa informar a data da sua última venda para que o robô consiga coletar as informações de sua carteira ativa. Para tanto, basta acessar sua conta na corretora encontrar qual a data/horário em que isto aconteceu. 

> Se for sua primeira operando em renda variável, você não deveria estar usando o robô. *#ficaDica*

Por exemplo, no seguinte caso:

![image](https://user-images.githubusercontent.com/1022404/34125435-5e516aa0-e41d-11e7-8ffc-3e4fc8e0a797.png)

A data seria `12/18/2017, 10:22:02 AM`, adicionados `duas horas` do fuso horário.

```javascript
//// Data da última venda realizada na plataforma ou, qualquer data no futuro caso vc
//// opte por iniciar vendido
dataBase : "2017-12-18 12:22:02"
```

Para ignorar a carteira atual na corretora basta informar `true` como valor para `iniciaComprado`. 

```javascript
/// Caso queira que o robô ignore o valor `dataBase` e inicie uma carteira nova, altere este valor para `true`
iniciaComprado: false
```

Para permitir a venda parcial de suas cryptos, altere o valor da variável `vendaParcial` para `true`.

```javascript
/// Caso queira que o robô ignore o valor `dataBase` e inicie uma carteira nova, altere este valor para `true`
vendaParcial: false
```

## Executando

Para executar, basta utilizar o seguinte comando:

```
node algodinha.js
```

## Status de execução

Se você quiser acompanhar o status do robô enquanto estiver longe do seu servidor/computador basta acessar o endereço: `http://ip_da_sua_maquina:1337/` (ou localmente em `http://localhost:1337/`).

### Logs
Os logs são salvos em disco no caminho `./log/algodinha.txt`. Recomendo o uso do [Baretail free](https://www.baremetalsoft.com/baretail/) para acompanhar - inclusive disponibilizei no projeto um arquivo de preferências `baretail.udm` com o highlight dos pricipais eventos do log.

### Problemas conhecidos
Veja a lista com as issues [aqui](https://github.com/felipegtx/algodinha/issues).

Os principais problemas, IMHO são os seguintes: 
  - **Demora na inicialização:** Em alguns momentos o snapshot do book pode demorar muito para chegar. É uma característica da infra da Blinktrade. Se isso acontecer com você (observável pela demora em iniciar o robô), basta reiniciar o robô.
  - **Reconexão:** O processo de reconexão ainda é bem arcaico. No estado atual, não recomendo que você deixe o robô executando sem supervisão.
  
## Contribuição

Contribuições em forma de Bitcoin e/ou PRs são muito bem vindas! Peço apenas que antes de trabalhar/enviar uma PR entre em contato comigo para alinharmos as expectativas e approach da implementação.

**Gostou _MUITO_? Se quiser me fazer um agrado pagando um cafezinho, tá fácil:** 
 - Carteira [SegWit](https://en.wikipedia.org/wiki/SegWit): `bc1qjfsqzmhu9na6ark3ldxxqfay8tjk72c67c9qhy`
 - Carteira BTC: `18BE5nYMmX91yu26Qh81UaNm7c89MmMj71`

