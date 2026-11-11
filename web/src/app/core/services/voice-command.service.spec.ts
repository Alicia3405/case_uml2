import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceCommandService, ParsedVoiceCommand } from './voice-command.service';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  clear(): void {
    this.store = {};
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

describe('VoiceCommandService', () => {
  let service: VoiceCommandService;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    (globalThis as any).localStorage = new MockStorage();
    injector = createEnvironmentInjector([], null as any);
    runInInjectionContext(injector, () => {
      service = new VoiceCommandService();
    });
  });

  it('debe parsear creación de clase simple y con atributos inline (ES/EN)', () => {
    const simple = service.parseTranscript('crea clase Cliente');
    expect(simple.type).toBe('CREATE_CLASS');
    expect(simple.payload.className).toBe('Cliente');
    expect(simple.payload.inlineAttributes).toBeUndefined();

    const withAttrs = service.parseTranscript(
      'crea clase Factura con id UUID pk, fecha LocalDate y total decimal',
    );
    expect(withAttrs.type).toBe('CREATE_CLASS');
    expect(withAttrs.payload.className).toBe('Factura');
    expect(withAttrs.payload.inlineAttributes).toHaveLength(3);
    expect(withAttrs.payload.inlineAttributes?.[0]).toMatchObject({
      name: 'id',
      type: 'UUID',
      isPrimaryKey: true,
      isNullable: false,
    });
    expect(withAttrs.payload.inlineAttributes?.[1]).toMatchObject({
      name: 'fecha',
      type: 'LocalDate',
      isPrimaryKey: false,
    });
    expect(withAttrs.payload.inlineAttributes?.[2]).toMatchObject({
      name: 'total',
      type: 'BigDecimal',
    });

    const english = service.parseTranscript('create class ShoppingCart');
    expect(english.type).toBe('CREATE_CLASS');
    expect(english.payload.className).toBe('ShoppingCart');
  });

  it('debe parsear creación de interfaz, enumeración y nota UML', () => {
    const iface = service.parseTranscript('crea interfaz IPagoService');
    expect(iface.type).toBe('CREATE_INTERFACE');
    expect(iface.payload.className).toBe('IPagoService');

    const enumCmd = service.parseTranscript('crea enum EstadoPedido con los valores PENDIENTE, PAGADO y ENVIADO');
    expect(enumCmd.type).toBe('CREATE_ENUM');
    expect(enumCmd.payload.className).toBe('EstadoPedido');
    expect(enumCmd.payload.enumLiterals).toEqual(['PENDIENTE', 'PAGADO', 'ENVIADO']);

    const noteCmd = service.parseTranscript('agrega una nota llamada ReglaFiscal que diga Aplicar IVA del 13%');
    expect(noteCmd.type).toBe('CREATE_NOTE');
    expect(noteCmd.payload.noteTitle).toBe('ReglaFiscal');
    expect(noteCmd.payload.noteContent).toBe('Aplicar IVA del 13%');
  });

  it('debe parsear adición y eliminación de atributos, PK y métodos', () => {
    const pkDefault = service.parseTranscript('agrega clave primaria de tipo Long a Cliente');
    expect(pkDefault.type).toBe('ADD_ATTRIBUTE');
    expect(pkDefault.payload).toMatchObject({
      className: 'Cliente',
      attributeName: 'id',
      attributeType: 'Long',
      isPrimaryKey: true,
      isNullable: false,
    });

    const attr = service.parseTranscript('agrega atributo precio_unitario decimal no nulo a Producto');
    expect(attr.type).toBe('ADD_ATTRIBUTE');
    expect(attr.payload).toMatchObject({
      className: 'Producto',
      attributeName: 'precioUnitario',
      attributeType: 'BigDecimal',
      isPrimaryKey: false,
      isNullable: false,
    });

    const method = service.parseTranscript('agrega metodo calcular_total que retorna decimal a Factura');
    expect(method.type).toBe('ADD_METHOD');
    expect(method.payload).toMatchObject({
      className: 'Factura',
      methodName: 'calcularTotal',
      returnType: 'BigDecimal',
      visibility: '+',
    });

    const delAttr = service.parseTranscript('elimina atributo edad de Cliente');
    expect(delAttr.type).toBe('DELETE_ATTRIBUTE');
    expect(delAttr.payload).toEqual({ className: 'Cliente', attributeName: 'edad' });

    const delMethod = service.parseTranscript('delete method pay from Order');
    expect(delMethod.type).toBe('DELETE_METHOD');
    expect(delMethod.payload).toEqual({ className: 'Order', methodName: 'pay' });
  });

  it('debe parsear todas las relaciones UML: herencia, realización, composición, agregación y N:M', () => {
    const inherit = service.parseTranscript('Estudiante hereda de Persona');
    expect(inherit.type).toBe('CONNECT_CLASSES');
    expect(inherit.payload).toMatchObject({
      sourceClass: 'Estudiante',
      targetClass: 'Persona',
      relationType: 'generalization',
      sourceMultiplicity: '',
      targetMultiplicity: '',
    });

    const realize = service.parseTranscript('PagoTarjeta implementa IPago');
    expect(realize.type).toBe('CONNECT_CLASSES');
    expect(realize.payload).toMatchObject({
      sourceClass: 'PagoTarjeta',
      targetClass: 'IPago',
      relationType: 'realization',
    });

    const comp = service.parseTranscript('crea composicion entre Pedido y DetallePedido uno a muchos');
    expect(comp.type).toBe('CONNECT_CLASSES');
    expect(comp.payload).toMatchObject({
      sourceClass: 'Pedido',
      targetClass: 'DetallePedido',
      relationType: 'composition',
      sourceMultiplicity: '1',
      targetMultiplicity: '1..*',
    });

    const aggr = service.parseTranscript('conecta agregacion entre Departamento y Empleado muchos a uno');
    expect(aggr.type).toBe('CONNECT_CLASSES');
    expect(aggr.payload).toMatchObject({
      sourceClass: 'Departamento',
      targetClass: 'Empleado',
      relationType: 'aggregation',
      sourceMultiplicity: '0..*',
      targetMultiplicity: '1',
    });

    const m2m = service.parseTranscript('conecta Estudiante con Curso muchos a muchos');
    expect(m2m.type).toBe('CONNECT_CLASSES');
    expect(m2m.payload).toMatchObject({
      sourceClass: 'Estudiante',
      targetClass: 'Curso',
      relationType: 'association_class',
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
    });
  });

  it('debe parsear renombrar, eliminar clase, acciones CASE/editor y comandos desconocidos', () => {
    expect(service.parseTranscript('renombra clase Cliente a Consumidor')).toMatchObject({
      type: 'RENAME_CLASS',
      payload: { className: 'Cliente', newClassName: 'Consumidor' },
    });

    expect(service.parseTranscript('elimina la clase Temporal')).toMatchObject({
      type: 'DELETE_CLASS',
      payload: { className: 'Temporal' },
    });

    expect(service.parseTranscript('deshacer').type).toBe('UNDO');
    expect(service.parseTranscript('redo').type).toBe('REDO');
    expect(service.parseTranscript('auditar normalizacion').type).toBe('AUDIT_MODEL');
    expect(service.parseTranscript('genera sql').type).toBe('GENERATE_SQL');
    expect(service.parseTranscript('valida xmi').type).toBe('VALIDATE_XMI');
    expect(service.parseTranscript('zoom in').type).toBe('ZOOM_IN');
    expect(service.parseTranscript('alejar').type).toBe('ZOOM_OUT');
    expect(service.parseTranscript('centrar').type).toBe('RESET_VIEW');
    expect(service.parseTranscript('limpia el lienzo').type).toBe('CLEAR_CANVAS');
    expect(service.parseTranscript('cualquier frase sin sentido').type).toBe('UNKNOWN');
  });

  it('debe evitar duplicados en 650ms al procesar transcripciones y persistir mute TTS', () => {
    const detected: ParsedVoiceCommand[] = [];
    service.commandDetected$.subscribe((cmd) => detected.push(cmd));

    const speakSpy = vi.spyOn(service, 'speak');

    const first = service.processTranscript('crea clase Producto');
    const duplicate = service.processTranscript('crea clase producto');
    const second = service.processTranscript('crea clase Venta');

    expect(first?.type).toBe('CREATE_CLASS');
    expect(duplicate).toBeNull();
    expect(second?.type).toBe('CREATE_CLASS');
    expect(detected).toHaveLength(2);
    expect(service.commandHistory()[0].payload.className).toBe('Venta');

    service.processTranscript('blah blah sin sentido');
    expect(speakSpy).toHaveBeenCalledWith(expect.stringContaining('No entendí el comando'));

    expect(service.isMuted()).toBe(false);
    service.toggleMute();
    expect(service.isMuted()).toBe(true);
    expect((globalThis as any).localStorage.getItem('uml_voice_tts_muted')).toBe('true');
  });
});

