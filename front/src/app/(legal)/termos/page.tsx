import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = {
  title: "Termos de Uso | 4YUmkt",
  description: "Termos de uso do 4YUmkt.",
};

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      updatedAt="22 de junho de 2026"
      crossLabel="Ver Política de Privacidade"
      crossHref="/privacidade"
    >
      <p style={{ fontSize: 16, color: "#3B3354" }}>
        Estes Termos de Uso são o combinado entre você e o 4YUmkt. Ao criar uma conta ou usar a plataforma,
        você concorda com tudo o que está aqui. Leia com calma, foi escrito pra ser entendido.
      </p>

      <h2 id="servico">1. O que o 4YUmkt faz</h2>
      <p>
        O 4YUmkt é uma ferramenta que ajuda gestores de tráfego a encontrar potenciais clientes. A gente
        busca negócios em fontes públicas, monta fichas com as informações disponíveis e sugere uma
        abordagem. A decisão de contatar e o envio das mensagens são sempre seus.
      </p>

      <h2 id="conta">2. Sua conta</h2>
      <ul>
        <li>Você precisa de dados verdadeiros para se cadastrar.</li>
        <li>Você é responsável por manter sua senha em segurança.</li>
        <li>Tudo que acontece na sua conta é de sua responsabilidade.</li>
        <li>A conta é individual. Planos com vários usuários seguem as regras do plano contratado.</li>
      </ul>

      <h2 id="uso-correto">3. Uso correto da plataforma</h2>
      <p>Ao usar o 4YUmkt, você se compromete a:</p>
      <ul>
        <li>Respeitar a legislação, incluindo a LGPD e as regras de comunicação eletrônica.</li>
        <li>Não usar os dados para spam, fraude, assédio ou qualquer prática abusiva.</li>
        <li>Abordar os contatos de forma respeitosa e profissional.</li>
        <li>Não tentar burlar, copiar ou explorar a plataforma de forma indevida.</li>
      </ul>
      <p>
        O envio de mensagens é feito por você. Você é o único responsável pelo conteúdo e pela forma como
        contata cada negócio.
      </p>

      <h2 id="pagamento">4. Planos e pagamento</h2>
      <ul>
        <li>Os planos e valores ficam descritos na página de planos do site.</li>
        <li>A cobrança é mensal e recorrente, conforme o plano escolhido.</li>
        <li>Não há fidelidade: você pode cancelar quando quiser, pelo painel ou pelo suporte.</li>
        <li>Ao cancelar, o acesso continua até o fim do período já pago.</li>
      </ul>

      <h2 id="propriedade">5. Propriedade intelectual</h2>
      <p>
        A marca, o software, o design e os textos do 4YUmkt são nossos. Você recebe o direito de usar a
        plataforma enquanto for assinante, mas não pode copiar, revender ou redistribuir a ferramenta sem
        nossa autorização.
      </p>

      <h2 id="disponibilidade">6. Disponibilidade</h2>
      <p>
        A gente trabalha para manter o 4YUmkt no ar e funcionando bem, mas pode haver manutenções e
        instabilidades pontuais. Não garantimos funcionamento ininterrupto e não nos responsabilizamos por
        perdas decorrentes de indisponibilidade temporária.
      </p>

      <h2 id="limite">7. Limite de responsabilidade</h2>
      <p>
        O 4YUmkt entrega informações e sugestões, mas não garante que cada lead vire cliente. O resultado
        depende do seu trabalho de prospecção e venda. A gente não se responsabiliza pelo uso que você faz
        dos dados nem pelo conteúdo das mensagens que você envia.
      </p>

      <h2 id="encerramento">8. Encerramento</h2>
      <p>
        Você pode encerrar sua conta quando quiser. A gente também pode suspender ou encerrar contas que
        violem estes termos, especialmente em casos de uso abusivo ou ilegal da plataforma.
      </p>

      <h2 id="alteracoes">9. Alterações nos termos</h2>
      <p>
        Estes termos podem ser atualizados. Quando isso acontecer, avisamos pelo site ou por email.
        Continuar usando a plataforma depois das mudanças significa que você concorda com a nova versão.
      </p>

      <h2 id="foro">10. Lei e foro</h2>
      <p>
        Estes termos seguem as leis brasileiras. Qualquer questão será resolvida no foro da comarca do
        domicílio do consumidor, conforme o Código de Defesa do Consumidor.
      </p>

      <h2 id="contato">11. Fale com a gente</h2>
      <p>
        Dúvidas sobre estes termos? Escreva para <a href="mailto:4yumkt@gmail.com">4yumkt@gmail.com</a> ou
        chame no WhatsApp <a href="https://wa.me/5511911001414">(11) 91100-1414</a>.
      </p>
    </LegalPage>
  );
}
