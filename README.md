# Algodinha

Algoritmo de negociação automatizada para Bitcoin - via Foxbit / [Blinktrade](https://github.com/blinktrade/BlinkTradeJS).

## Sobre

O robô executa a estratégia de [Scalper](https://www.daytraderpro.com.br/blog/o-que-e-scalping/), visando pequenos lucros no maior número de ordens possíveis.

**IMPORTANTE:** Não me responsabilizo por qualquer tipo de prejuizo causado pelo uso desta ferramenta :exclamation:

## Instalando

Baixe o fonte ou realiza um clone deste Repo, em seguida baixe as dependêcias do projeto por meio do comando:

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



