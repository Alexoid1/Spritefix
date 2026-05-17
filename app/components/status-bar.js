import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

export default class StatusBarComponent extends Component {
  @service('sprite-forge') forge;

  get modeLabel() {
    return (
      { sel: 'Seleccionar', drw: 'Dibujar', mov: 'Mover', pan: 'Pan' }[
        this.forge.mode
      ] || '—'
    );
  }
}
