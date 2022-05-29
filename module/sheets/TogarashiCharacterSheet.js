import { itemStatsCalc } from "../core/itemTotalStatsCalc.js";
import { characterStatsCalc } from "../core/characterTotalStatsCalc.js";

export default class TogarashiCharacterSheet extends ActorSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 840,
            height: 450,
            template: `systems/togarashi/templates/sheets/character-sheet.html`,
            classes: [ "togarashi", "sheet", "character" ]
        });
    }

    itemContextMenu = [
        {
            name: game.i18n.localize("togarashi.equip"),
            icon: '<i class="fas fa-child"></i>',
            condition: element => !element.hasClass("selected") && (element.data("item-type") == "weapon" || element.data("item-type") == "armor"),
            callback: element => {
                const item = this.actor.items.get(element.data("item-id"));
                
                if (item.data.type == "weapon") {
                    this.actor.update({ "data.equippedItems.weapon": item.data._id });
                } else if (item.data.type == "armor") {
                    this.actor.update({ "data.equippedItems.armor": item.data._id });
                }
            }
        },
        {
            name: game.i18n.localize("togarashi.unequip"),
            icon: '<i class="fas fa-child"></i>',
            condition: element => element.hasClass("selected") && (element.data("item-type") == "weapon" || element.data("item-type") == "armor"),
            callback: element => {
                const item = this.actor.items.get(element.data("item-id"));
                
                if (item.data.type == "weapon") {
                    this.actor.update({ "data.equippedItems.weapon": "" });
                } else if (item.data.type == "armor") {
                    this.actor.update({ "data.equippedItems.armor": "" });
                }
            }
        },
        {
            name: game.i18n.localize("togarashi.see"),
            icon: '<i class="fas fa-edit"></i>',
            callback: element => {
                const item = this.actor.items.get(element.data("item-id"));
                item.sheet.render(true);
            }
        },
        {
            name: game.i18n.localize("togarashi.delete"),
            icon: '<i class="fas fa-trash"></i>',
            callback: element => {
                this.actor.deleteEmbeddedDocuments("Item", [element.data("item-id")]);
            }
        }
    ];

    statModContextMenu = [
        {
            name: game.i18n.localize("togarashi.delete"),
            icon: '<i class="fas fa-trash"></i>',
            callback: element => {
                const id = element.data("item-id");
                const currentStatusModList = this.getData().data.statusModifiers;
                currentStatusModList.splice(id, 1);
                this.actor.update({ "data.statusModifiers": currentStatusModList });
            }
        }
    ];

    masteryContextMenu = [
        {
            name: game.i18n.localize("togarashi.delete"),
            icon: '<i class="fas fa-trash"></i>',
            callback: element => {
                const id = element.data("item-id");
                const currentMasteryList = this.getData().data.masteries;
                currentMasteryList.splice(id, 1);
                this.actor.update({ "data.masteries": currentMasteryList });
            }
        }
    ];

    get template() {
        return `systems/togarashi/templates/sheets/character-sheet.html`;
    }

    getData() {
        const baseData = super.getData();

        let sheetData = {
            owner: this.actor.isOwner,
            editable: this.isEditable,
            actor: baseData.actor,
            data: baseData.actor.data.data,
            config: CONFIG.togarashi,
            items: baseData.items,
            guard: characterStatsCalc(baseData.actor.data),
            weapons: baseData.items.filter(item => item.type == "weapon").map(itemStatsCalc),
            armors: baseData.items.filter(item => item.type == "armor").map(itemStatsCalc),
            genericItems: baseData.items.filter(item => item.type == "generic").map(itemStatsCalc),
            weightStats: {
                curr: baseData.items.map(itemStatsCalc).reduce((a, b) => a + b.weight, 0),
                max: 5 * this.getFullForce()
            }
        };

        return sheetData;
    }

    getApplyableMasteries() {
        const baseData = super.getData().data.data;
        const masteries = baseData.masteries;
        const equipedWeaponId = baseData.equippedItems.weapon;

        if (equipedWeaponId == "") return [];

        const equipedWeaponItem = this.actor.items.get(equipedWeaponId);
        const equipedWeaponType = equipedWeaponItem.data.data.type;

        return masteries.filter(mastery => mastery.weapon == equipedWeaponType);
    }

    getStatusModWhileActive() {
        const baseData = super.getData().data.data;
        const statModifiers = baseData.statusModifiers;
        return statModifiers.filter(sm => sm.modifierType == "whileActive");
    }

    getPermanentStatusMods() {
        const baseData = super.getData().data.data;
        const statModifiers = baseData.statusModifiers;
        return statModifiers.filter(sm => sm.modifierType == "permanent");
    };

    tickStatusMods() {
        const baseData = super.getData().data.data;
        const permanentMods = this.getPermanentStatusMods();
        permanentMods.forEach(mod => {
            if (typeof baseData[mod.status] == "object") {
                const currentStat = baseData[mod.status].base;
                this.actor.update({ [`data.${mod.status}.base`]: currentStat + mod.modifier });
            } else {
                const currentStat = baseData[mod.status];
                this.actor.update({ [`data.${mod.status}`]: currentStat + mod.modifier });
            }
        });
    }

    getFullForce() {
        const baseData = super.getData();
        const base = baseData.actor.data.data.force.base;
        const modifier = baseData.actor.data.data.force.modifier;
        const masteryModifiers = this.getApplyableMasteries().filter(m => m.status == "force");
        const statModifiers = this.getStatusModWhileActive().filter(sm => sm.status == "force");

        const masteryModSum = masteryModifiers.reduce((cumm, curr) => cumm + curr.modifier, 0);
        const statModSum = statModifiers.reduce((cumm, curr) => cumm + curr.modifier, 0);

        return base + modifier + masteryModSum + statModSum;
    }

    activateListeners(html) {
        if (this.isEditable) {
            new ContextMenu(html, ".item-card", this.itemContextMenu);
            new ContextMenu(html, ".mastery-card", this.masteryContextMenu);
            new ContextMenu(html, ".status-mod-card", this.statModContextMenu);
            
            html.find(".add-mastery-button").click(this._onMasteryAdd.bind(this));
            html.find(".add-status-mod-button").click(this._onStatusModifierAdd.bind(this));

            html.find(".change-field").change(ev => this._onEditChange(ev));
        }
    }

    _onMasteryAdd(event) {
        event.preventDefault();
        const currentMasteryList = this.getData().data.masteries;
        currentMasteryList.push({ status: "health", weapon: "dagger", modifier: 0 });
        this.actor.update({ "data.masteries": currentMasteryList });
    }

    _onStatusModifierAdd(event) {
        event.preventDefault();
        const currentStatusModList = this.getData().data.statusModifiers;
        currentStatusModList.push({ status: "health", modifierType: "whileActive", modifier: 0 });
        this.actor.update({ "data.statusModifiers": currentStatusModList });
    }

    async _onEditChange(event) {
        event.preventDefault(); 
    
        const element = event.currentTarget;
        const listRow = element.closest("tr");
    
        const index = listRow.dataset.changeIndex;
        const array = listRow.dataset.changeArray;
    
        const field = element.dataset.field;
        let value = element.value;
        if(element.dataset.dtype == "Number") value = Number(value);

        this._onArrayEdit(index, array, { [field]: value });
    }

    _onArrayEdit(index, array, changes) {
        let currentArray = this.getData().data[array];
        currentArray[index] = mergeObject(currentArray[index], changes);
        this.actor.update({ [`data.${array}`]: currentArray });
    }
}
