import { Effect, Option, Schema as S } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { AsyncData, Command, Http, Update, type Runtime } from "foldkit";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { modifyFields } from "foldkit/struct";

import { Tabs } from "@foldkit/ui";

import { quadrantMap } from "./quadrantMap.ts";
import {
  percent,
  pp,
  quadrantInfo,
  quarterLabel,
  RegimeSnapshot,
  type RegimePoint,
} from "./regime.ts";

// MODEL

const RegimeData = AsyncData.Schema(RegimeSnapshot, S.String);

export const Panel = S.Literals(["Quadrant map", "History"]);
export type Panel = typeof Panel.Type;
const panels: ReadonlyArray<Panel> = ["Quadrant map", "History"];

/** How many recent quarters the map's trail shows. */
const trailOptions = [8, 12, 20, 40] as const;

export const Model = S.Struct({
  regime: RegimeData.schema,
  tabs: Tabs.Model,
  activePanel: Panel,
  trailQuarters: S.Number,
});
export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetry: {},
  SelectedTrailQuarters: { quarters: S.Number },
  SucceededFetchRegime: { snapshot: RegimeSnapshot },
  FailedFetchRegime: { error: S.String },
  GotTabsMessage: { message: Tabs.Message },
});
export type Message = typeof Message.Type;

// COMMAND

const FetchRegime = Command.define("FetchRegime", {
  messages: [Message.SucceededFetchRegime, Message.FailedFetchRegime],
  execute: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.get(`${import.meta.env.VITE_API_URL}/api/regime`),
    );
    if (response.status !== 200) {
      return yield* Effect.fail(`API responded ${response.status}`);
    }
    const snapshot = yield* S.decodeUnknownEffect(RegimeSnapshot)(
      yield* response.json,
    );
    return Message.SucceededFetchRegime({ snapshot });
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(Message.FailedFetchRegime({ error: String(error) })),
    ),
    Effect.provide(Http.layer),
  ),
});

// UPDATE

const PanelTabs = Tabs.create<Panel>();

const foldTabs = Update.foldChild({
  update: PanelTabs.update,
  read: (model: Model) => Option.some(model.tabs),
  write: (model, tabs) => modifyFields(model, { tabs: () => tabs }),
  toParentMessage: (message) => Message.GotTabsMessage({ message }),
  foldOutMessage: Tabs.OutMessage.match<Update.Step<Model, Message>, Tabs.OutMessage<Panel>>({
    Selected:
      ({ value }) =>
      (model) => ({ model: modifyFields(model, { activePanel: () => value }) }),
  }),
});

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedRetry: () => ({
      model: modifyFields(model, { regime: () => RegimeData.Loading() }),
      commands: [FetchRegime()],
    }),
    SelectedTrailQuarters: ({ quarters }) => ({
      model: modifyFields(model, { trailQuarters: () => quarters }),
    }),
    SucceededFetchRegime: ({ snapshot }) => ({
      model: modifyFields(model, {
        regime: () => RegimeData.Success({ data: snapshot }),
      }),
    }),
    FailedFetchRegime: ({ error }) => ({
      model: modifyFields(model, { regime: () => RegimeData.Failure({ error }) }),
    }),
    GotTabsMessage: ({ message }) => foldTabs(model, message),
  });

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    regime: RegimeData.Loading(),
    tabs: Tabs.init({ id: "panels" }),
    activePanel: "Quadrant map",
    trailQuarters: 12,
  },
  commands: [FetchRegime()],
});

// VIEW

const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900";

const stat = (h: HtmlBuilder<Message>, label: string, value: string, sub: string): Html =>
  h.div(
    [h.Class("flex flex-col gap-0.5")],
    [
      h.span([h.Class("text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400")], [label]),
      h.span([h.Class("text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100")], [value]),
      h.span([h.Class("text-sm tabular-nums text-slate-500 dark:text-slate-400")], [sub]),
    ],
  );

const currentCard = (h: HtmlBuilder<Message>, snapshot: RegimeSnapshot): Html => {
  const { current, sources } = snapshot;
  const info = quadrantInfo[current.quadrant];
  return h.section(
    [h.Class(`${card} flex flex-col gap-6`), h.AriaLabel("Current regime")],
    [
      h.div(
        [h.Class("flex flex-wrap items-center gap-3")],
        [
          h.span([h.Class(`rounded-full px-3 py-1 text-lg font-semibold ${info.badge}`)], [current.quadrant]),
          h.span([h.Class("text-slate-600 dark:text-slate-300")], [`${info.blurb} · ${quarterLabel(current.date)}`]),
        ],
      ),
      h.div(
        [h.Class("grid grid-cols-1 gap-6 sm:grid-cols-2")],
        [
          stat(h, `Growth news · ${sources.growth}`, pp(current.growthNews), `Real GDP ${percent(current.growthYoY)} YoY`),
          stat(h, `Inflation news · ${sources.inflation}`, pp(current.inflationNews), `CPI ${percent(current.inflationYoY)} YoY`),
        ],
      ),
    ],
  );
};

const trailPicker = (h: HtmlBuilder<Message>, selected: number): Html =>
  h.div(
    [h.Class("flex flex-wrap items-center gap-2 text-sm"), h.Role("group"), h.AriaLabel("Trail length")],
    [
      h.span([h.Class("text-slate-500 dark:text-slate-400")], ["Trail"]),
      ...trailOptions.map((quarters) =>
        h.button(
          [
            h.OnClick(Message.SelectedTrailQuarters({ quarters })),
            h.Attribute("aria-pressed", String(quarters === selected)),
            h.Class(
              "rounded-md border px-2.5 py-1 tabular-nums border-slate-300 text-slate-700 hover:bg-slate-100 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:aria-pressed:border-slate-100 dark:aria-pressed:bg-slate-100 dark:aria-pressed:text-slate-900",
            ),
          ],
          [`${quarters / 4}y`],
        ),
      ),
    ],
  );

const mapPanel = (h: HtmlBuilder<Message>, model: Model, history: ReadonlyArray<RegimePoint>): Html =>
  h.div(
    [h.Class("flex flex-col items-center gap-4")],
    [
      trailPicker(h, model.trailQuarters),
      quadrantMap(h, history.slice(-model.trailQuarters)),
      h.p(
        [h.Class("max-w-prose text-center text-sm text-slate-500 dark:text-slate-400")],
        ["Large dot is the latest quarter; the dashed trail runs oldest (faint) to newest. Hover a dot for its values."],
      ),
    ],
  );

const historyPanel = (h: HtmlBuilder<Message>, history: ReadonlyArray<RegimePoint>): Html => {
  const th = (label: string, align = "text-right") =>
    h.th([h.Class(`px-3 py-2 font-medium ${align}`), h.Attribute("scope", "col")], [label]);
  const td = (value: string) => h.td([h.Class("px-3 py-1.5 text-right tabular-nums")], [value]);
  return h.div(
    [h.Class("max-h-[560px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800")],
    [
      h.table(
        [h.Class("w-full text-sm")],
        [
          h.thead(
            [h.Class("sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300")],
            [h.tr([], [th("Quarter", "text-left"), th("Regime", "text-left"), th("GDP YoY"), th("Growth news"), th("CPI YoY"), th("Inflation news")])],
          ),
          h.tbody(
            [h.Class("divide-y divide-slate-100 text-slate-800 dark:divide-slate-800 dark:text-slate-200")],
            [...history].reverse().map((p) =>
              h.tr(
                [h.Key(p.date)],
                [
                  h.td([h.Class("px-3 py-1.5 tabular-nums")], [quarterLabel(p.date)]),
                  h.td(
                    [h.Class("px-3 py-1.5")],
                    [h.span([h.Class(`rounded-full px-2 py-0.5 text-xs font-medium ${quadrantInfo[p.quadrant].badge}`)], [p.quadrant])],
                  ),
                  td(percent(p.growthYoY)),
                  td(pp(p.growthNews)),
                  td(percent(p.inflationYoY)),
                  td(pp(p.inflationNews)),
                ],
              ),
            ),
          ),
        ],
      ),
    ],
  );
};

const panelsView = (h: HtmlBuilder<Message>, model: Model, snapshot: RegimeSnapshot): Html =>
  h.submodel({
    slotId: "panels",
    model: model.tabs,
    view: PanelTabs.view,
    viewInputs: {
      tabs: panels,
      selectedValue: model.activePanel,
      ariaLabel: "Regime views",
      toView: ({ tablist, tabs, activeIndex }) =>
        h.section(
          [h.Class(`${card} flex flex-col gap-6`)],
          [
            h.div(
              [...tablist, h.Class("flex gap-1 border-b border-slate-200 dark:border-slate-800")],
              tabs.map((tab) =>
                h.button(
                  [
                    ...tab.tab,
                    h.Class(
                      "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 data-[selected]:border-slate-900 data-[selected]:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 dark:data-[selected]:border-slate-100 dark:data-[selected]:text-slate-100",
                    ),
                  ],
                  [tab.value],
                ),
              ),
            ),
            ...tabs
              .filter((tab) => tab.index === activeIndex)
              .map((tab) =>
                h.div(
                  [...tab.panel],
                  [
                    tab.value === "Quadrant map"
                      ? mapPanel(h, model, snapshot.history)
                      : historyPanel(h, snapshot.history),
                  ],
                ),
              ),
          ],
        ),
    },
    toParentMessage: (message) => Message.GotTabsMessage({ message }),
  });

const methodology = (h: HtmlBuilder<Message>, snapshot: RegimeSnapshot): Html =>
  h.footer(
    [h.Class("flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-400")],
    [
      h.p(
        [],
        [
          "News = year-on-year rate minus the same rate one year earlier (the “change” measure in AQR, ",
          h.em([], ["Inflation Redux?"]),
          ", 2026). Positive growth news with negative inflation news is Goldilocks, and so on around the map. Data: FRED ",
          `${snapshot.sources.growth} (real GDP) and ${snapshot.sources.inflation} (CPI, averaged to quarters). Refreshed weekly.`,
        ],
      ),
      h.p([], [`Snapshot computed ${new Date(snapshot.computedAt).toUTCString()}.`]),
    ],
  );

const statusCard = (h: HtmlBuilder<Message>, body: ReadonlyArray<Html | string>): Html =>
  h.section([h.Class(`${card} flex flex-col items-start gap-3 text-slate-600 dark:text-slate-300`)], [...body]);

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: AsyncData.matchData(model.regime, {
    onData: (s) => `${s.current.quadrant} · Four Quadrants Monitor`,
    onFailure: () => "Four Quadrants Monitor",
    onEmpty: () => "Four Quadrants Monitor",
  }),
  body: h.div(
    [h.Class("min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950")],
    [
      h.main(
        [h.Class("mx-auto flex max-w-4xl flex-col gap-6")],
        [
          h.header(
            [h.Class("flex flex-col gap-1")],
            [
              h.h1([h.Class("text-2xl font-bold text-slate-900 dark:text-slate-100")], ["Four Quadrants Monitor"]),
              h.p([h.Class("text-slate-500 dark:text-slate-400")], ["US growth × inflation regime"]),
            ],
          ),
          ...AsyncData.matchData(model.regime, {
            onData: (snapshot): ReadonlyArray<Html> => [
              currentCard(h, snapshot),
              panelsView(h, model, snapshot),
              methodology(h, snapshot),
            ],
            onFailure: (error): ReadonlyArray<Html> => [
              statusCard(h, [
                h.p([h.Class("font-medium text-rose-700 dark:text-rose-400")], ["Couldn’t load the regime snapshot."]),
                h.p([h.Class("text-sm")], [error]),
                h.button(
                  [
                    h.OnClick(Message.ClickedRetry()),
                    h.Class("rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"),
                  ],
                  ["Retry"],
                ),
              ]),
            ],
            onEmpty: (): ReadonlyArray<Html> => [statusCard(h, [h.p([h.Class("animate-pulse")], ["Loading regime snapshot…"])])],
          }),
        ],
      ),
    ],
  ),
});
