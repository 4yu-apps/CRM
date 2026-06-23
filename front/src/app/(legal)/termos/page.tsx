import type { Metadata } from "next";
import { LegalPage } from "../legal";

export const metadata: Metadata = {
  title: "Termos de Uso | 4YU CRM",
  description: "Termos de uso do 4YU CRM.",
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
        Estes Termos de Uso são o combinado entre você e o 4YU CRM. Ao criar uma conta ou usar a plataforma,
        você concorda com tudo o que está aqui. Leia com calma, foi escrito pra ser entendido.
      </p>

      <h2 id="servico">1. O que o 4YU CRM faz</h2>
      <p>
        O 4YU CRM é uma ferramenta que ajuda gestores de tráfego a encontrar potenciais clientes. A gente
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
      <p>Ao usar o 4YU CRM, você se compromete a:</p>
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

      <h2 id="terceiros">4. Serviços de terceiros e integrações</h2>
      <p>
        O 4YU CRM se integra a serviços de terceiros para funcionar. Ao usar essas integrações, você também
        concorda com os termos e as políticas do respectivo serviço:
      </p>
      <ul>
        <li>
          <strong>Login e Google Calendar:</strong> se você entra com a Conta Google e conecta a agenda,
          autoriza o 4YU CRM a criar, atualizar e remover os eventos das reuniões que você agenda no app. Esse
          acesso é opcional, usado apenas a seu pedido, e pode ser revogado a qualquer momento na sua Conta
          Google. O tratamento desses dados segue a nossa{" "}
          <a href="/privacidade">Política de Privacidade</a>.
        </li>
        <li>
          <strong>Dados públicos de negócios:</strong> os leads são montados a partir de fontes públicas, como
          mapas e sites. A conferência das informações e o contato com cada negócio são de sua
          responsabilidade.
        </li>
      </ul>

      <h2 id="pagamento">5. Planos e pagamento</h2>
      <ul>
        <li>Os planos e valores ficam descritos na página de planos do site.</li>
        <li>A cobrança é mensal e recorrente, conforme o plano escolhido.</li>
        <li>Não há fidelidade: você pode cancelar quando quiser, pelo painel ou pelo suporte.</li>
        <li>Ao cancelar, o acesso continua até o fim do período já pago.</li>
        <li>
          Os valores podem mudar. Quando isso acontecer, avisamos com antecedência e a alteração só vale para
          o próximo ciclo de cobrança.
        </li>
      </ul>

      <h2 id="propriedade">6. Propriedade intelectual</h2>
      <p>
        A marca, o software, o design e os textos do 4YU CRM são nossos. Você recebe o direito de usar a
        plataforma enquanto for assinante, mas não pode copiar, revender ou redistribuir a ferramenta sem
        nossa autorização.
      </p>

      <h2 id="disponibilidade">7. Disponibilidade</h2>
      <p>
        A gente trabalha para manter o 4YU CRM no ar e funcionando bem, mas pode haver manutenções e
        instabilidades pontuais. Não garantimos funcionamento ininterrupto e não nos responsabilizamos por
        perdas decorrentes de indisponibilidade temporária.
      </p>

      <h2 id="limite">8. Limite de responsabilidade</h2>
      <p>
        O 4YU CRM entrega informações e sugestões, mas não garante que cada lead vire cliente. O resultado
        depende do seu trabalho de prospecção e venda. A gente não se responsabiliza pelo uso que você faz
        dos dados nem pelo conteúdo das mensagens que você envia.
      </p>
      <p>
        Você concorda em manter o 4YU CRM isento de reclamações de terceiros que decorram do uso indevido da
        plataforma por você, em especial quanto à forma como aborda e contata os leads.
      </p>

      <h2 id="encerramento">9. Encerramento</h2>
      <p>
        Você pode encerrar sua conta quando quiser. A gente também pode suspender ou encerrar contas que
        violem estes termos, especialmente em casos de uso abusivo ou ilegal da plataforma.
      </p>

      <h2 id="alteracoes">10. Alterações nos termos</h2>
      <p>
        Estes termos podem ser atualizados. Quando isso acontecer, avisamos pelo site ou por email.
        Continuar usando a plataforma depois das mudanças significa que você concorda com a nova versão.
      </p>

      <h2 id="foro">11. Lei e foro</h2>
      <p>
        Estes termos seguem as leis brasileiras. Qualquer questão será resolvida no foro da comarca do
        domicílio do consumidor, conforme o Código de Defesa do Consumidor.
      </p>

      <h2 id="contato">12. Fale com a gente</h2>
      <p>
        Dúvidas sobre estes termos? Escreva para <a href="mailto:4yumkt@gmail.com">4yumkt@gmail.com</a> ou
        chame no WhatsApp <a href="https://wa.me/5511911001414">(11) 91100-1414</a>.
      </p>
    </LegalPage>
  );
}
