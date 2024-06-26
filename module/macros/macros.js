import { togarashi } from "../config.js";
import { calculateDamage } from "../core/togarashiDamageCalc.js";
import { waitListener } from "../utils/htmlUtilities.js";
import { guarda_calc, togarashi_roll } from "../core/togarashiRolls.js";
import { createAreaOfEffect } from "../utils/uiEffects.js";
import TogarashiAttackDialogForm from "../forms/TogarashiAttackDialogForm.js";
import TogarashiAuraShieldDialogForm from "../forms/TogarashiAuraShieldDialogForm.js";
import TogarashiRollDialogForm from "../forms/TogarashiRollDialogForm.js";

export const customizableAttack = async () => {
    const casterInfo = getCasterInfo();
    if (!casterInfo.targetActor) return;

    let lowerRange = casterInfo.targetActor.getFullStat("lowerRange");
    let upperRange = casterInfo.targetActor.getFullStat("upperRange");

    const playerWeapon = casterInfo.targetActor.getEquippedWeapon();
    if (playerWeapon) {
        lowerRange += playerWeapon.lowerRange;
        upperRange += playerWeapon.upperRange;
    }

    const tokenCenter = casterInfo.targetToken.center || casterInfo.targetToken._object.center;

    createAreaOfEffect(tokenCenter, lowerRange, "#00ff00");
    if (lowerRange != upperRange)
        createAreaOfEffect(tokenCenter, upperRange, "#ffff00");

    game.user.updateTokenTargets();
    const targetInfo = await waitForTargetSelection(casterInfo.targetToken, () => canExitTrigger);

    if (!targetInfo.targetActor) return;

    const casterId = casterInfo.targetToken.data._id;
    const targetId = targetInfo.targetToken.data._id;

    if (casterId == targetId) {
        ui.notifications.error(game.i18n.localize("Você não pode atacar a si mesmo"));
        return;
    }

    const options = await openAttackDialogBox(
        casterInfo.targetActor.data.name,
        targetInfo.targetActor.data.name,
        casterInfo.targetActor
    );

    if (!options.cancelled) {
        const target = targetInfo.targetActor;
        const { guardLow, guardHigh } = target.characterStatsCalc();
        const diceCount = casterInfo.targetActor.getFullStat("dexterity");
        const damageTypes = [options.damageType, options.secondaryDamageType];

        // Calculate successes in each guard
        const attackInfo = await guarda_calc(casterInfo.targetActor, diceCount, guardLow, guardHigh, options.accuracy, options.critical);

        // Calculate damage
        const defenseEquippedWeapon = target.getEquippedWeapon();
        const defenseEquippedArmor = target.getEquippedArmor();

        const damageInfo = calculateDamage({
            upperSucesses: attackInfo.upper,
            lowerSuccesses: attackInfo.lower,
            damageTypes: damageTypes,
            damagePerSuccess: options.damage,
            defenseForce: target.getFullStat("force"),
            auraShield: target.getAuraShieldBlock(),
            defenseWeaponBlock: (defenseEquippedWeapon && target.isUsingWeaponBlock()) ? defenseEquippedWeapon.block : 0,
            armorDefenseBlock: defenseEquippedArmor ? defenseEquippedArmor.block : 0,
            otherDefenseBlock: target.getFullStat("block")
        });

        try {
            togarashi.socket.executeAsGM("executeDamageFromAttack", casterId, targetId, attackInfo, damageInfo, damageTypes, options.applyEffects);
        } catch (e) {
            ui.notifications.error("Não foi possível aplicar os danos visto que não temos um GM online");
        }
    }
};

export const useWeaponBlock = async () => {
    const casterInfo = getCasterInfo();
    if (!casterInfo.targetActor) return;

    const playerWeapon = casterInfo.targetActor.getEquippedWeapon();
    if (playerWeapon) {
        const casterIntuition = casterInfo.targetActor.getFullStat("intuition");
        const roll = await togarashi_roll(casterInfo.targetActor, casterIntuition, 6, 10, 1, 0);


        if (roll.sucesses > 0) {
            try {
                const casterId = casterInfo.targetToken.data._id;
                togarashi.socket.executeAsGM("setWeaponBlockUsage", casterId, true);
            } catch (e) {
                ui.notifications.error("Não foi possível aplicar os danos visto que não temos um GM online");
            }
        } else {
            ui.notifications.error("Você falhou no teste de intuição para bloquear.");
        }
    } else {
        ui.notifications.error("O token selecionado não tem nenhuma arma equipada.");
    }
};

export const useAuraShield = async () => {
    const casterInfo = getCasterInfo();
    if (!casterInfo.targetActor) return;

    const options = await openAuraShieldDialogBox(
        casterInfo.targetActor.data.name,
        casterInfo.targetActor
    );

    const fullBodyShield = options.auraShieldType == "fullBody";
    const useOrangeAura = options.auraShieldAura == "orange";

    const casterIntuition = casterInfo.targetActor.getFullStat("intuition");
    const roll = await togarashi_roll(casterInfo.targetActor, casterIntuition, 6, 10, 1, 0);

    if (roll.sucesses > 0) {
        try {
            const casterId = casterInfo.targetToken.data._id;
            togarashi.socket.executeAsGM("setAuraShieldUsage", casterId, true, fullBodyShield, useOrangeAura);
        } catch (e) {
            ui.notifications.error("Não foi possível aplicar os danos visto que não temos um GM online");
        }
    } else {
        ui.notifications.error("Você falhou no teste de intuição para usar o escudo de aura.");
    }
};

export const useRollDice = async () => {
    const casterInfo = getCasterInfo();
    if (!casterInfo.targetActor) return;

    const options = await openRollDialogBox(
        casterInfo.targetActor.data.name,
        casterInfo.targetActor
    );

    const numberDice = parseInt(options.numberDice);
    const difficulty = parseInt(options.difficulty);
    const modifier = parseInt(options.modifier);

    const roll = await togarashi_roll(casterInfo.targetActor, numberDice, difficulty, 10, 1, modifier);

    await new Promise(r => setTimeout(r, 2000));

    const template = "systems/togarashi/templates/chat/roll-successes.html";
    await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: casterInfo.targetActor }),
        content: await renderTemplate(template, {
            numberDice: numberDice,
            difficulty: difficulty,
            modifier: modifier,
            successes: roll.sucesses
        })
    });
};

const waitForTargetSelection = async (prevSelectedToken) => {
    let canExitTrigger = false;
    new Promise(async () => {
        const element = document.querySelector("html");
        for (let i = 0; i < 2; i++) {
            await new Promise(r => setTimeout(r, 100));
            await waitListener(element, "click");
        }
        canExitTrigger = true;
    }).then();

    let info = getTargetedActorToken();

    while (!info.targetActor || info.targetToken.data._id == prevSelectedToken.data._id) {
        await new Promise(r => setTimeout(r, 100));
        if (canExitTrigger) break;
        info = getTargetedActorToken();
    }

    return info;
};

const getSelectedActorToken = () => {
    const speaker = ChatMessage.implementation.getSpeaker();
    const targetToken = canvas.tokens.get(speaker.token);
    return {
        targetToken: targetToken,
        targetActor: targetToken?.actor
    }
};

const getTargetedActorToken = () => {
    const targetToken = Array.from(game.user.targets)[0];
    return {
        targetToken: targetToken,
        targetActor: targetToken?.actor
    }
};

const getUserListOfActorsTokens = () => {
    const userId = game.user.id;
    const userSceneId = game.user.viewedScene;
    const userScene = game.scenes.get(userSceneId);
    const userSceneTokens = Array.from(userScene.data.tokens.values());
    const userTokens = userSceneTokens.filter(t => t.actor.data.permission[userId] > 0);
    const userActors = userTokens.map(t => t.actor);
    return { userTokens, userActors };
};

const getCasterInfo = () => {
    const { userTokens, userActors } = getUserListOfActorsTokens();

    if (userActors.length == 0) {
        ui.notifications.error(game.i18n.localize("togarashi.attackDialogBox.noActorError"));
        return {};
    } else if (userActors.length == 1) {
        return {
            targetToken: userTokens[0],
            targetActor: userActors[0]
        }
    } else {
        const { targetToken, targetActor } = getSelectedActorToken();
        if (targetToken) {
            return { targetToken, targetActor }
        } else {
            ui.notifications.error(game.i18n.localize("togarashi.attackDialogBox.multipleActorNoSelectedError"));
            return {};
        }
    }
};

export const openAttackDialogBox = async (actorName, targetName, actor) => {
    return new Promise(resolve => {
        new TogarashiAttackDialogForm(actorName, targetName, actor, resolve).render(true);
    });
};

export const openRollDialogBox = async (actorName, actor) => {
    return new Promise(resolve => {
        new TogarashiRollDialogForm(actorName, actor, resolve).render(true);
    });
};

export const openAuraShieldDialogBox = async (actorName, actor) => {
    return new Promise(resolve => {
        new TogarashiAuraShieldDialogForm(actorName, actor, resolve).render(true);
    });
};
