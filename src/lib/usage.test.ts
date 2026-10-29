import { describe, expect, it } from "vitest";
import { deleteBlockedMessage } from "./usage";

describe("deleteBlockedMessage", () => {
  it("свободную статью можно удалить", () => {
    expect(deleteBlockedMessage("Статья", { operations: 0, rules: 0 })).toBeNull();
  });

  it("блокирует удаление, если есть только регулярное правило", () => {
    expect(deleteBlockedMessage("Статья", { operations: 0, rules: 1 })).toBe(
      "Статья используется в 1 регулярном правиле — удаление недоступно."
    );
  });

  it("перечисляет операции и правила с правильными окончаниями", () => {
    expect(deleteBlockedMessage("Счёт", { operations: 21, rules: 2 })).toBe(
      "Счёт используется в 21 операции и 2 регулярных правилах — удаление недоступно."
    );
    expect(deleteBlockedMessage("Счёт", { operations: 11, rules: 0 })).toBe(
      "Счёт используется в 11 операциях — удаление недоступно."
    );
  });
});
