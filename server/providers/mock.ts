import type { AIProvider, GenerateOptions } from './interface.ts'

// Delay to simulate real API latency
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractContext(messages: GenerateOptions['messages']): string {
  const userMsg = [...messages].reverse().find(m => m.role === 'user')
  return userMsg?.content ?? ''
}

function extractSystemRole(messages: GenerateOptions['messages']): string {
  const sys = messages.find(m => m.role === 'system')
  return sys?.content ?? ''
}

// Determine mock response type from system prompt content
function detectType(systemContent: string): string {
  if (systemContent.includes('nejslabší předpoklad') || systemContent.includes('VERDIKT')) return 'weakest'
  if (systemContent.includes('Praktický poradce') || systemContent.includes('praktický poradce')) return 'practical'
  if (systemContent.includes('Kritický oponent') || systemContent.includes('kritický oponent')) return 'critical'
  if (systemContent.includes('Kreativní stratég') || systemContent.includes('kreativní stratég')) return 'creative'
  if (systemContent.includes('Praktik') && systemContent.includes('proveditelnost')) return 'council_practitioner'
  if (systemContent.includes('Skeptik') && systemContent.includes('rizika')) return 'council_skeptic'
  if (systemContent.includes('Stratég') && systemContent.includes('positioning')) return 'council_strategist'
  if (systemContent.includes('hodnotit') || systemContent.includes('silné') && systemContent.includes('slabé')) return 'evaluation'
  if (systemContent.includes('Předseda') || systemContent.includes('předseda')) return 'synthesis'
  return 'general'
}

function topicFromPrompt(prompt: string) {
  const singleLine = prompt.replace(/\s+/g, ' ').trim()
  return singleLine.length > 96 ? `${singleLine.slice(0, 96)}...` : singleLine
}

function mockWeakest(prompt: string) {
  const topic = topicFromPrompt(prompt)
  const verdict = prompt.length % 4 === 0 ? 'upravit' : 'nejdřív ověřit'

  return JSON.stringify({
    verdict,
    verdictReason:
      'Klíčový předpoklad zatím není ověřený na reálném chování lidí, takže by bylo riskantní do něj víc investovat bez rychlého testu.',
    weakestAssumption: `Předpokládáš, že lidé nebo klient opravdu chtějí "${topic}" řešit teď a že kvůli tomu udělají konkrétní další krok bez dodatečného vysvětlování nebo ruční pomoci.`,
    whyCritical:
      'Když tenhle předpoklad neplatí, nevznikne opakovatelná poptávka. Můžeš postavit proces nebo produkt, ale nebude mít dostatečný tah, aby se udržel obchodně nebo provozně.',
    blindSpot:
      'Pravděpodobně podceňuješ tření v prvním kroku. To, že nápad dává smysl tobě, ještě neznamená, že uživatel nebo klient okamžitě pochopí hodnotu a bude jednat.',
    firstTest:
      'Nabídni nejmenší možnou verzi ručně 5 až 10 konkrétním lidem z cílové skupiny. Nesnaž se vysvětlovat celý koncept, sleduj hlavně to, jestli sami udělají další krok.',
    killCriterion:
      'Pokud ani po zpřesnění nabídky alespoň 3 z 10 oslovených lidí neudělají jasnou akci, například odpověď, rezervaci hovoru nebo potvrzení zájmu, změň nabídku nebo plán zastav.',
    nextStep:
      'Ještě dnes sepiš jednu větu s jasnou hodnotou nabídky, pošli ji prvním relevantním lidem a do 48 hodin vyhodnoť, jak konkrétně reagovali.',
  })
}

function getMockForType(type: string, userPrompt: string): string {
  if (type === 'weakest') return mockWeakest(userPrompt)

  if (type === 'practical') {
    const topic = topicFromPrompt(userPrompt)
    return `**Praktické zhodnocení**

Přímá odpověď na tvou otázku:

${userPrompt.length > 20 ? `Na základě toho, co popisuješ kolem "${topic}",` : 'Obecně'} doporučuji postupovat takhle:

1. Nejprve ověř, zda existuje skutečná poptávka — mluv přímo se 3-5 potenciálními zákazníky nebo uživateli.
2. Udělej nejmenší možnou verzi toho, co plánuješ. Nepřepínej to.
3. Nastav si konkrétní metrikový cíl pro prvních 30 dní.

**Realistický odhad:** Pokud začneš tento týden, výsledky uvidíš za 3–6 týdnů.

**Jeden konkrétní krok:** Domluv si do konce týdne schůzku nebo hovor s jedním člověkem, pro kterého to máš být řešení.`
  }

  if (type === 'critical') {
    const topic = topicFromPrompt(userPrompt)
    return `**Kde vidím slabiny**

U tématu "${topic}" je to, co tě pravděpodobně čeká:

**Hlavní riziko:** Předpokládáš, že cílová skupina chce to, co nabízíš. To je velký předpoklad bez ověření.

**Co přehlížíš:**
- Existující alternativy jsou pravděpodobně lepší nebo levnější, než si myslíš
- Pořizovací cena zákazníka bude vyšší, než odhaduješ
- Provozní náklady porostou rychleji než tržby

**Nejslabší argument:** "Tohle trh potřebuje" — to je tvůj názor, ne fakt.

**Protiargument:** Pokud by to bylo tak snadné nebo hodnotné, někdo to pravděpodobně už dělá. Co děláš jinak nebo lépe?

**Co to neznamená:** Nejde o to nechat toho. Jde o to vědět, kde přesně leží největší riziko, a ověřit ho jako první.`
  }

  if (type === 'creative') {
    const topic = topicFromPrompt(userPrompt)
    return `**Alternativní úhly pohledu**

Pár věcí, které možná u "${topic}" nevidíš:

**Nečekaná možnost:** Co kdybys problém otočil — místo aby ses ty snažil přesvědčit zákazníky, co kdybys nechal zákazníky přijít za tebou? To mění distribuční strategii úplně.

**Širší pohled:** Zákazník, kterého chceš oslovit, pravděpodobně řeší 5 problémů najednou. Tvůj produkt nebo služba řeší jeden z nich. Je to ten nejpalčivější?

**Alternativní model:** Co kdybys nespouštěl produkt, ale nabídl službu ručně pro 3 zákazníky? Naučíš se 10x víc za zlomek nákladů.

**Neobvyklý zákazník:** Kdo by si tohle koupil jako první — i kdyby to nebylo "ideální" publikum? Tenhle zákazník ti může otevřít dveře, které nevidíš.

**Experiment místo produktu:** Nejrychlejší test není kód ani landing page — je to emailový vlákno nebo WhatsApp skupina.`
  }

  if (type === 'council_practitioner') {
    const topic = topicFromPrompt(userPrompt)
    return `Z praktického pohledu vidím tři klíčové věci:

Kontext řešení: ${topic}

**Proveditelnost:** Tohle je realizovatelné, ale časový plán je pravděpodobně optimistický o 50–100 %. Počítej s tím.

**Náklady a zdroje:** Největší skryté náklady budou v akvizici zákazníků a provozní podpoře, ne v samotném produktu.

**Nejbližší krok:** Před jakýmkoliv dalším rozvojem ověř jeden konkrétní předpoklad — ten o platební ochotě zákazníků. Bez toho vše ostatní stojí na vodě.

**Moje doporučení:** Spusť pilotní verzi s jedním zákazníkem. Ručně. Bez technologie. Zjistíš víc za jeden týden než za měsíc vývoje.`
  }

  if (type === 'council_skeptic') {
    const topic = topicFromPrompt(userPrompt)
    return `Hledám, kde to může selhat:

U zadání "${topic}" je potřeba být tvrdý hlavně k předpokladům, které zatím nejsou podložené.

**Největší riziko:** Předpoklad o zákaznické ochotě platit není ověřen. To je smrtelné riziko pro jakýkoli obchodní model.

**Slepé místo:** Pravděpodobně podcenuješ konkurenci — ne přímou, ale nepřímou. Zákazník má vždy alternativu: nedělat nic, dělat to jinak, nebo použít jiné řešení.

**Slabý argument v celém plánu:** "Zákazníci to chtějí" — tato věta se opakuje, ale není doložená. Co to konkrétně znamená? Kolik by za to zaplatili? Kolik jich bylo dotazováno?

**Co chybí:** Žádná zmínka o retenci. Získat zákazníka je polovina práce. Udržet ho je druhá polovina a obvykle těžší.

**Nejdůležitější otázka:** Pokud by to nefungovalo po 90 dnech, jak bys to poznal? Máš konkrétní metriku?`
  }

  if (type === 'council_strategist') {
    const topic = topicFromPrompt(userPrompt)
    return `Z pohledu strategie a dlouhodobé hodnoty:

Pokud má "${topic}" fungovat i za rok, musí být jasné, proč je tahle cesta lepší než jednodušší alternativa.

**Positioning:** Není jasné, proč právě tohle a proč právě ty. Silná strategie vždy odpovídá na otázku: "Proč vy a ne někdo jiný?"

**Alternativy, které stojí za úvahu:**
- Partnerství místo přímého prodeje — rychlejší přístup k zákazníkům bez nutnosti budovat distribuci od nuly
- Niche místo broad market — jeden segment zákazníků, kde jsi nejlepší, bije průměrné řešení pro všechny

**Dlouhodobá hodnota:** Kde je udržitelná výhoda? Pokud tě konkurence může zkopírovat za 6 měsíců, potřebuješ buď rychlejší growth, nebo hlubší diferenciaci.

**Největší strategická příležitost:** Vlastnictví dat nebo vztahu se zákazníkem. To ostatní mohou přijít.

**Strategický verdikt:** Myšlenka má potenciál, ale bez jasného "proč právě vy" bude obtížné se bránit vstupu větších hráčů.`
  }

  if (type === 'evaluation') {
    return JSON.stringify({
      strengths:
        'Praktický pohled přináší konkrétní kroky a realistický odhad. Skeptický pohled správně identifikuje chybějící ověření platební ochoty.',
      weaknesses:
        'Strategický pohled je místy příliš obecný a praktik mohl být ještě konkrétnější v časových odhadech a prioritě prvního testu.',
      missing:
        'V debatě chybí otázka distribuce a toho, jak se zákazník o řešení dozví bez drahé akvizice.',
      bestArgument:
        'Nejdůležitější argument je, že bez ověřené platební ochoty jsou ostatní úvahy předčasné.',
    })
  }

  if (type === 'synthesis') {
    return JSON.stringify({
      summary: "Rada se shoduje, že myšlenka má logiku, ale klíčový předpoklad — zákaznická ochota platit — zatím není ověřen. To je nutné udělat jako první krok.",
      consensus: [
        "Předpoklad o platební ochotě zákazníků je nutné ověřit před dalším rozvojem",
        "Pilotní testování s reálnými zákazníky je správný první krok",
        "Časový plán je optimistický a měl by počítat s prodlevami"
      ],
      disagreements: [
        "Praktik by šel rovnou do akce, skeptik by nejprve strávil více času ověřováním",
        "Stratég preferuje diferenciaci produktu, praktik preferuje rychlou distribuci"
      ],
      strongestArgument: "Získat zákazníka, který za řešení skutečně zaplatí, je jediný způsob, jak ověřit, že problém, který řešíš, je pro trh dostatečně palčivý.",
      biggestRisk: "Strávit 3–6 měsíců budováním řešení a zjistit, že zákazníci jsou ochotni platit méně než polovina předpokládané ceny.",
      missingInfo: "Konkrétní data o tom, kolik zákazníků bylo dotazováno a jaké byly jejich přesné odpovědi na otázku ceny.",
      nextStep: "Tento týden: sestav seznam 10 konkrétních lidí nebo firem a oslovi je s přímou otázkou — zaplatili by za toto řešení? Kolik? Proč?",
      verdict: "nejdřív ověřit"
    })
  }

  return `Odpovídám na tvou otázku: ${userPrompt.slice(0, 50)}...

Toto je obecná odpověď z mock provideru. Nastav ANTHROPIC_API_KEY pro reálné odpovědi.`
}

export class MockProvider implements AIProvider {
  name = 'mock'
  model = 'mock-cs-v1'

  async generate(options: GenerateOptions): Promise<string> {
    await delay(800 + Math.random() * 600)
    const systemContent = extractSystemRole(options.messages)
    const userPrompt = extractContext(options.messages)
    const type = detectType(systemContent)
    return getMockForType(type, userPrompt)
  }
}
