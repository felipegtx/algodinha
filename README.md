# Algodinha

Algoritmo de negociação automatizada para Bitcoin - via Foxbit / [Blinktrade](https://github.com/blinktrade/BlinkTradeJS).

## Sobre

O robô executa a estratégia de [Scalper](https://www.daytraderpro.com.br/blog/o-que-e-scalping/), visando pequenos lucros no maior número de ordens possíveis.

Execute literalmente por sua conta e risco. 

## Instalando

Baixe o fonte ou clone o Repo e baixe as dependêcias usando:

```javascript
npm install
```

## Configurando

### Segurança
Antes de executar o robô você precisa gerar suas credenciais de acesso [aqui](https://foxbit.exchange/#api). Estes dados devem ser salvos em um arquivo chamado `api.json` na raiz da biblioteca utilizando o seguinte formato:

```javascript
{ 
    "user": "",
    "password": "",
    "secret": ""
}
```

### Parametrização
Você deve também parametrizar a execução considerando os limites e riscos que você está disposto a correr com a ferramenta. Os principais parâmetros que coordenam a proporção risco/lucro são os seguintes:

```
valorMaximoCompra : 70000,
maximoGastos : 2500,
valorOrdem : 100,
lucroEsperado : 0.06,
```

De fato, como regra geral, estes são os únicos parâmetros que você precisaria alterar para realizar a execução.

#### Carteira

Na versão atual você precisa informar a data da sua última venda para que o robô consiga coletar as informações de sua carteira ativa. Para tanto, basta acessar sua conta na corretora encontrar qual a data/horário em que isto aconteceu. 

> Se for sua primeira operando em renda variável, você não deveria estar usando o robô. *#ficaDica*

Por exemplo, no seguinte caso:

![image](https://user-images.githubusercontent.com/1022404/34125435-5e516aa0-e41d-11e7-8ffc-3e4fc8e0a797.png)

A data seria `12/18/2017, 10:22:02 AM`, adicionados `duas horas` do fuso horário.
```
dataBase : "2017-12-18 12:22:03"
```

## Executando

Para executar, basta utilizar o seguinte comando:

```
node algodinha.js
```



