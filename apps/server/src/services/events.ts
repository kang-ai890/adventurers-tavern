import { prisma, type Player } from "@tavern/database";
import {
  EVENT_DEFS,
  EVENT_TRIGGER_CHANCE,
  getEvent,
  type EventPendingDto,
  type EventResolveResultDto,
} from "@tavern/shared";
import { httpError } from "../auth.js";
import { addExp } from "./leveling.js";

interface PendingEvent {
  eventId: string;
  expiresAt: number;
}

/** 待处理事件（内存态，单实例开发期够用；多实例部署时迁数据库） */
const pendingEvents = new Map<string, PendingEvent>();

function pickWeightedEvent(): string {
  const total = EVENT_DEFS.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of EVENT_DEFS) {
    roll -= e.weight;
    if (roll <= 0) return e.id;
  }
  return EVENT_DEFS[EVENT_DEFS.length - 1].id;
}

/** 收获时判定：18% 触发奇遇（阶段3简化版；正式版为每2小时判定+保底）
 *  force=true 仅用于开发环境 E2E 测试的确定性触发 */
export function maybeTriggerEvent(playerId: string, force = false): EventPendingDto | null {
  if (!force && Math.random() > EVENT_TRIGGER_CHANCE) return null;
  const eventId = pickWeightedEvent();
  const def = getEvent(eventId)!;
  const expiresAt = Date.now() + 5 * 60_000; // 5 分钟内选择
  pendingEvents.set(playerId, { eventId, expiresAt });
  return {
    eventId,
    title: def.title,
    text: def.text,
    options: {
      A: { label: def.options.A.label, description: def.options.A.description },
      B: { label: def.options.B.label, description: def.options.B.description },
    },
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export interface EffectEntry {
  label: string;
  value: string;
}

async function applyEffects(
  player: Player,
  effects: Array<{ stones?: number; fame?: number; exp?: number; consumeMostValuable?: boolean; growSpeedup?: number }>,
): Promise<EffectEntry[]> {
  const entries: EffectEntry[] = [];
  let stones = 0;
  let fame = 0;
  let exp = 0;
  let consumed: string | null = null;

  for (const fx of effects) {
    stones += fx.stones ?? 0;
    fame += fx.fame ?? 0;
    exp += fx.exp ?? 0;
    if (fx.consumeMostValuable) {
      const best = await prisma.playerInventory.findFirst({
        where: { playerId: player.id, quantity: { gt: 0 } },
        include: { item: true },
        orderBy: { item: { basePrice: "desc" } },
      });
      if (best) {
        await prisma.playerInventory.update({
          where: { id: best.id },
          data: { quantity: { decrement: 1 } },
        });
        consumed = `${best.item.icon}${best.item.name}`;
      }
    }
    if (fx.growSpeedup && fx.growSpeedup > 0 && fx.growSpeedup < 1) {
      const growing = await prisma.farmPlot.findMany({
        where: { playerId: player.id, cropId: { not: null }, readyAt: { gt: new Date() } },
      });
      for (const plot of growing) {
        const remaining = plot.readyAt!.getTime() - Date.now();
        await prisma.farmPlot.update({
          where: { id: plot.id },
          data: { readyAt: new Date(Date.now() + remaining * (1 - fx.growSpeedup)) },
        });
      }
      if (growing.length > 0) entries.push({ label: "灵田", value: `${growing.length} 块地生长提速` });
    }
  }

  if (stones !== 0) {
    await prisma.player.update({ where: { id: player.id }, data: { stones: { increment: stones } } });
    entries.push({ label: "灵石", value: `${stones > 0 ? "+" : ""}${stones}` });
  }
  if (fame !== 0) {
    await prisma.player.update({ where: { id: player.id }, data: { fame: { increment: fame } } });
    entries.push({ label: "口碑", value: `${fame > 0 ? "+" : ""}${fame}` });
  }
  if (exp > 0) {
    await addExp(player, exp);
    entries.push({ label: "修为", value: `+${exp}` });
  }
  if (consumed) entries.push({ label: "献出", value: consumed });

  return entries;
}

/** 结算事件选项（含随机分支），写入事件日志 */
export async function resolveEvent(
  player: Player,
  eventId: string,
  option: "A" | "B",
): Promise<EventResolveResultDto> {
  const pending = pendingEvents.get(player.id);
  if (!pending || pending.eventId !== eventId) {
    throw httpError(400, "奇遇已过期或不存在");
  }
  if (pending.expiresAt < Date.now()) {
    pendingEvents.delete(player.id);
    throw httpError(400, "奇遇已过期");
  }
  const def = getEvent(eventId);
  if (!def) throw httpError(404, "事件不存在");

  let text = "";
  let effects: EffectEntry[] = [];
  const roll = Math.random();

  switch (eventId) {
    case "pest_plague":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: -100 }]);
        text = "药到虫除，灵植保住了。";
      } else {
        if (roll < 0.3) {
          effects = await applyEffects(player, [{ stones: -50 }]);
          text = "虫灾蔓延，部分收成被啃食（灵石 -50）。";
        } else {
          effects = await applyEffects(player, [{ fame: 30 }]);
          text = "虫群引来了一群益鸟，酒馆口碑大涨（+30）！";
        }
      }
      break;

    case "elder_visit":
      if (option === "A") {
        effects = await applyEffects(player, [{ fame: 50 }]);
        text = "长老对酒馆赞不绝口，口碑 +50。";
      } else {
        const best = await prisma.playerInventory.findFirst({
          where: { playerId: player.id, quantity: { gt: 0 } },
          include: { item: true },
          orderBy: { item: { basePrice: "desc" } },
        });
        if (!best) {
          effects = await applyEffects(player, [{ fame: 50 }]);
          text = "后厨空空如也，只能以礼相待（口碑 +50）。";
        } else {
          effects = await applyEffects(player, [{ fame: 150, stones: 800, consumeMostValuable: true }]);
          text = `长老品鉴了你献上的${best.item.name}，留下手信与 800 灵石！`;
        }
      }
      break;

    case "meteor_fall":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: 200, fame: 10 }]);
        text = "官府收走了陨石，赏你 200 灵石。";
      } else {
        if (roll < 0.5) {
          effects = await applyEffects(player, [{ stones: 1500 }]);
          text = "陨铁成色极佳，卖了 1,500 灵石！";
        } else {
          effects = await applyEffects(player, [{ stones: -300 }]);
          text = "熔炼失败，炉子受损，修理花去 300 灵石。";
        }
      }
      break;

    case "lost_cultivator":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: 50, fame: 15 }]);
        text = "年轻修士千恩万谢，留下 50 灵石作谢礼。";
      } else {
        effects = await applyEffects(player, [{ stones: 60 }]);
        text = "留宿一宿（-100），次日他师傅派人送来 160 灵石酬谢。";
      }
      break;

    case "spirit_spring":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: 300 }]);
        text = "灵泉水卖了个好价钱，入账 300 灵石。";
      } else {
        effects = await applyEffects(player, [{ growSpeedup: 0.3 }]);
        text = "灵泉引入灵田，作物长势喜人（剩余生长时间 -30%）！";
      }
      break;

    case "drunk_immortal":
      if (option === "A") {
        effects = await applyEffects(player, [{ fame: 20 }]);
        text = "老仙醉醺醺地走了，客人直夸你掌柜有度量。";
      } else {
        if (roll < 0.5) {
          effects = await applyEffects(player, [{ stones: 1850 }]);
          text = "老仙酒醒后甩下一张醉仙方，价值 2,000 灵石（酒钱 150 已扣）！";
        } else {
          effects = await applyEffects(player, [{ stones: -150, fame: -30 }]);
          text = "喝到不省人事，客人被吓跑一半，口碑 -30。";
        }
      }
      break;

    case "fox_gratitude":
      if (option === "A") {
        effects = await applyEffects(player, []);
        text = "白狐深深一揖，转身没入山林。";
      } else {
        if (roll < 0.1) {
          effects = await applyEffects(player, [{ stones: 500, fame: -15 }]);
          text = "锦囊里是 500 灵石，可当晚店里被摸走了几件家什（口碑 -15）。";
        } else {
          effects = await applyEffects(player, [{ stones: 500 }]);
          text = "锦囊里是 500 灵石，白狐报恩，诚信实也！";
        }
      }
      break;

    case "thunder_temper":
      if (option === "A") {
        effects = await applyEffects(player, []);
        text = "雷声过后，酒馆安然无恙。";
      } else {
        if (roll < 0.5) {
          effects = await applyEffects(player, [{ exp: 60 }]);
          text = "雷电淬体，修为 +60！";
        } else {
          effects = await applyEffects(player, [{ stones: -100 }]);
          text = "雷劈坏了几件器物，修理花去 100 灵石。";
        }
      }
      break;

    case "peddler_pass":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: -800, exp: 300 }]);
        text = "你买下残卷参悟三日，修为 +300。";
      } else {
        effects = await applyEffects(player, []);
        text = "行脚商摇了摇头，挑起担子走了。";
      }
      break;

    case "beggar_alms":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: -10, fame: 10 }]);
        text = "乞丐连连作揖，逢人便夸酒馆掌柜心善。";
      } else {
        effects = await applyEffects(player, [{ stones: -200, exp: 80 }]);
        text = "打杂三日，他临走前传授了一套吐纳法门（修为 +80）。";
      }
      break;

    case "beast_escape":
      if (option === "A") {
        effects = await applyEffects(player, [{ stones: -100 }]);
        text = "村民们帮忙把灵兽找了回来（答谢 100 灵石）。";
      } else {
        effects = await applyEffects(player, [{ exp: 50 }]);
        text = "你一路追到后山，与灵兽斗智斗勇（修为 +50）。";
      }
      break;

    case "matchmaker":
      if (option === "A") {
        effects = await applyEffects(player, []);
        text = "老者捋须一笑：'缘分未到，强求不得。'";
      } else {
        effects = await applyEffects(player, [{ exp: 30 }]);
        text = "红线系腕，你隐约悟到一丝因果之道（修为 +30）。";
      }
      break;

    default:
      throw httpError(404, "事件不存在");
  }

  pendingEvents.delete(player.id);
  await prisma.eventLog.create({
    data: {
      playerId: player.id,
      eventId,
      option,
      result: effects as unknown as object,
    },
  });

  return { eventId, option, title: def.title, text, effects };
}
