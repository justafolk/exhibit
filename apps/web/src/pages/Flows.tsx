import { Icon, Notice, PageHeading } from '../ui';

export function Flows() {
  return (
    <>
      <PageHeading
        title="Flow catalog"
        description="Small, reviewable flows with deterministic expectations."
      />
      <Notice>
        <strong>Example catalog.</strong> This flow demonstrates the required
        structure. It is not approved for execution.
      </Notice>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">EXAMPLE FLOW</div>
            <h2>Checkout with a saved address</h2>
            <p>
              <code>checkout.saved-address</code>
            </p>
          </div>
          <span className="quiet-badge">Example only</span>
        </div>
        <div className="flow-definition">
          <div>
            <span className="definition-number">01</span>
            <div>
              <h3>Preconditions</h3>
              <p>
                Dedicated staging tenant, saved address, and a run-scoped cart.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">02</span>
            <div>
              <h3>Deterministic assertions</h3>
              <p>
                Saved address is selected, the order total matches, and
                confirmation appears.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">03</span>
            <div>
              <h3>Cleanup boundary</h3>
              <p>
                Remove only data tagged with the current run ID in the approved
                test tenant.
              </p>
            </div>
          </div>
          <div>
            <span className="definition-number">04</span>
            <div>
              <h3>Versioned knowledge</h3>
              <p>
                <code>agents/flows/checkout.yaml</code>
              </p>
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <Icon name="info" size={15} />A flow definition describes the checks.
          A trusted run provides the evidence.
        </div>
      </section>
    </>
  );
}
