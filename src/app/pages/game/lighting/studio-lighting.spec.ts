import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { StudioLighting } from './studio-lighting';

describe('Dice readiness lettering', () => {
  it('blinks white while ready and restores the original lettering immediately when disabled', () => {
    const frame = new Group();
    const model = new Group();
    frame.add(model);
    const label = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#010101' }));
    label.name = 'Label • ROLL THE DICE • orange pull lip';
    model.add(label);
    const lighting = new StudioLighting();
    lighting.attach(model, frame);
    const material = label.material;
    const black = material.color.clone();
    const emissive = material.emissive.clone();
    const intensity = material.emissiveIntensity;

    lighting.updateDiceReadiness(true, 0);
    expect(material.color.getHex()).toBe(0xffffff);
    lighting.updateDiceReadiness(true, 500);
    expect(material.color.equals(black)).toBeTrue();
    lighting.updateDiceReadiness(true, 500);
    expect(material.color.getHex()).toBe(0xffffff);
    lighting.updateDiceReadiness(false, 0);
    expect(material.color.equals(black)).toBeTrue();
    expect(material.emissive.equals(emissive)).toBeTrue();
    expect(material.emissiveIntensity).toBe(intensity);
    lighting.dispose();
    label.geometry.dispose();
  });
});
