/**
 * AccessibilityTree.js — Browser Accessibility Tree Parser
 * 
 * Extracts accessibility tree from browser:
 * - Parse DOM accessibility
 * - Identify interactive elements
 * - Map elements to actions
 * - Support for ARIA roles
 * 
 * License: MIT
 * RAM: ~2MB
 */

class AccessibilityTree {
    constructor(config = {}) {
        this._name = 'AccessibilityTree';
    }

    parse(page) {
        const elements = [];
        const interactive = ['button', 'link', 'input', 'select', 'textarea', 'checkbox', 'radio'];
        const tree = { root: { children: [] }, elements, interactiveElements: [] };

        try {
            if (page && page.accessibility) {
                const snapshot = page.accessibility.snapshot();
                if (snapshot) {
                    this._walkTree(snapshot, tree, 0);
                }
            }
        } catch (err) {
            // Fallback: return empty tree
        }

        tree.interactiveElements = tree.elements.filter(e => interactive.includes(e.role));
        return tree;
    }

    findClickable(tree, description) {
        const lower = description.toLowerCase();
        return tree.elements.find(e => 
            e.name?.toLowerCase().includes(lower) || 
            e.description?.toLowerCase().includes(lower) ||
            e.role === 'button' && e.name?.toLowerCase().includes(lower)
        );
    }

    findInput(tree, label) {
        const lower = label.toLowerCase();
        return tree.elements.find(e =>
            (e.role === 'textbox' || e.role === 'input') &&
            (e.name?.toLowerCase().includes(lower) || e.description?.toLowerCase().includes(lower))
        );
    }

    getElementActions(element) {
        const actions = [];
        if (['button', 'link', 'checkbox', 'radio'].includes(element.role)) actions.push('click');
        if (['textbox', 'input', 'textarea', 'select'].includes(element.role)) actions.push('type', 'clear');
        if (element.role === 'select') actions.push('select');
        return actions;
    }

    _walkTree(node, tree, depth) {
        if (!node) return;
        const element = { role: node.role || 'unknown', name: node.name || '', description: node.description || '', value: node.value || '', children: [], depth };
        tree.elements.push(element);
        if (node.children) {
            for (const child of node.children) {
                const childElement = this._walkTree(child, tree, depth + 1);
                if (childElement) element.children.push(childElement);
            }
        }
        return element;
    }
}

module.exports = { AccessibilityTree };
module.exports.default = AccessibilityTree;
