import Phaser from "phaser";
import { useGameStore } from "../store/useGameStore";
import { sendPlazaMove } from "../net/socket";

const WORLD_W = 1000;
const WORLD_H = 1000;
const SPEED = 200;

/** 骨架版场景：程序化绘制坊市地面与建筑，WASD/方向键移动并同步到广场 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private remotes = new Map<string, Phaser.GameObjects.Rectangle>();
  private lastEmit = 0;
  private lastRemoteSync = 0;

  constructor() {
    super("game");
  }

  create() {
    this.makeGround();
    this.makeBuildings();

    this.player = this.add.rectangle(400, 300, 26, 26, 0xffd166, 1).setDepth(10);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor("#2b3a2f");

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  update(time: number) {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;

    let direction: "up" | "down" | "left" | "right" = "down";
    if (vx !== 0 || vy !== 0) {
      const dt = this.game.loop.delta / 1000;
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * SPEED * dt;
      vy = (vy / len) * SPEED * dt;
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, 13, WORLD_W - 13);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, 13, WORLD_H - 13);
      if (Math.abs(vx) > Math.abs(vy)) direction = vx > 0 ? "right" : "left";
      else direction = vy > 0 ? "down" : "up";
    }

    if (time - this.lastEmit > 100) {
      this.lastEmit = time;
      sendPlazaMove({ x: Math.round(this.player.x), y: Math.round(this.player.y), direction });
    }

    if (time - this.lastRemoteSync > 200) {
      this.lastRemoteSync = time;
      this.syncRemotes();
    }
  }

  private makeGround() {
    const g = this.add.graphics();
    g.fillStyle(0x3a4d3c, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle(0x44583f, 1);
    for (let x = 0; x < WORLD_W; x += 100) {
      for (let y = 0; y < WORLD_H; y += 100) {
        g.fillRect(x + 2, y + 2, 96, 96);
      }
    }
    // 坊市石板路
    g.fillStyle(0x8a7f6a, 1);
    g.fillRect(0, 480, WORLD_W, 40);
    g.fillRect(480, 0, 40, WORLD_H);
    g.generateTexture("ground", WORLD_W, WORLD_H);
    g.destroy();
    this.add.image(0, 0, "ground").setOrigin(0);
  }

  private makeBuildings() {
    const spots: Array<[number, number, number]> = [
      [120, 120, 0x8c5a3c], // 酒馆
      [760, 120, 0x7a4a2f], // 客栈
      [120, 760, 0x5a6b4c], // 药铺
      [760, 760, 0x9c7a4c], // 坊市
      [440, 320, 0x6c6c6c], // 告示牌
    ];
    spots.forEach(([x, y, color], i) => {
      const house = this.add.rectangle(x, y, 90, 70, color, 1).setDepth(1);
      const roof = this.add.triangle(x, y - 55, 0, 30, 120, 30, 60, -20, 0x4a3528, 1).setDepth(1);
      const name = this.add
        .text(x, y + 50, ["酒馆", "客栈", "药铺", "坊市", "告示"][i], {
          fontSize: "14px",
          color: "#f5e9c8",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(2);
      void roof;
      void name;
      void house;
    });
  }

  private syncRemotes() {
    const { nearby, playerId } = useGameStore.getState();
    const seen = new Set<string>();
    for (const p of Object.values(nearby)) {
      seen.add(p.id);
      let rect = this.remotes.get(p.id);
      if (!rect) {
        rect = this.add.rectangle(p.x, p.y, 24, 24, 0x6fc3df, 1).setDepth(9);
        this.remotes.set(p.id, rect);
      }
      rect.x = p.x;
      rect.y = p.y;
    }
    for (const [id, rect] of this.remotes) {
      if (!seen.has(id) || id === playerId) {
        rect.destroy();
        this.remotes.delete(id);
      }
    }
  }
}
