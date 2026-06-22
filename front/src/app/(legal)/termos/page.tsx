import type { Metadata } from "next";
import { H2, LegalPage } from "../legal";

export const metadata: Metadata = {
  title: "Termos de Uso | 4YUmkt CRM",
  description: "Termos de uso do 4YUmkt CRM.",
};

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="22 de junho de 2026">
      <p>
        Estes Termos regem o uso do 4YUmkt CRM. Ao criar uma conta ou entrar no sistema, você
        concorda com eles. Se não concordar, não use a plataforma.
      </p>

      <H2>O que o sistema faz</H2>
      <p>
        O 4YUmkt CRM ajuda no trabalho de prospecção: encontra negócios em fontes públicas, completa
        e qualifica os dados, escreve rascunhos de mensagem e organiza seu funil. A decisão de
        aprovar, contatar e fechar é sempre sua. O sistema não envia mensagens automaticamente.
      </p>

      <H2>Sua conta</H2>
      <p>
        Você é responsável por manter suas credenciais seguras e por toda atividade na sua conta.
        Cada conta tem seus dados isolados.
      </p>

      <H2>Uso responsável</H2>
      <p>
        Você se compromete a usar o sistema de forma legal e ética, respeitando a LGPD e as regras de
        cada canal de contato (por exemplo, WhatsApp). Não use a plataforma para spam, assédio ou
        qualquer abordagem que viole a vontade de quem pediu para não ser contatado. O contato com os
        leads e o conteúdo enviado são de sua responsabilidade.
      </p>

      <H2>Dados de terceiros</H2>
      <p>
        Os dados de negócios exibidos vêm de fontes públicas e podem conter imprecisões. Confira as
        informações antes de agir. Negócios podem solicitar a remoção (opt-out) a qualquer momento.
      </p>

      <H2>Disponibilidade</H2>
      <p>
        O serviço é oferecido como está. Podemos alterar, suspender ou encerrar recursos, e fazer
        manutenções que afetem temporariamente o acesso.
      </p>

      <H2>Limitação de responsabilidade</H2>
      <p>
        Na medida permitida em lei, a 4YUmkt não se responsabiliza por resultados de prospecção,
        perdas comerciais ou pelo uso que você faz das informações e mensagens geradas.
      </p>

      <H2>Contato</H2>
      <p>Dúvidas sobre estes Termos: 4yumkt@gmail.com.</p>
    </LegalPage>
  );
}
